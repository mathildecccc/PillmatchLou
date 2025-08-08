/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { useUser, useUI } from '@/lib/state';

const API_KEY =
  import.meta.env.VITE_API_KEY ||
  import.meta.env.VITE_GEMINI_API_KEY ||
  import.meta.env.GEMINI_API_KEY ||
  '';

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
}

type ConversationStage =
  | 'GREETING'
  | 'AWAITING_CONTRACEPTION'
  | 'AWAITING_PRODUCT'
  | 'PROCESSING'
  | 'DONE';

type Message = {
  id: string;
  sender: 'bot' | 'user';
  text?: string;
  analysis?: InteractionResult;
};

type InteractionResult = {
  interactionLevel: 'faible' | 'moyen' | 'grave' | 'inconnu';
  title: string;
  explanation: string;
  scientificBasis: string;
  sources: { name: string; url: string }[];
  contraceptionImpact: string;
  recommendation: {
    timing: string;
    alternative: string;
  };
};

// ---------- Normalisation produit + KB locale ----------
function normalizeProduct(raw: string): { canonical: string; synonyms: string[] } {
  const s = raw.toLowerCase().trim();

  const table = [
    { canonical: 'fer (sels ferreux: sulfate, gluconate)', synonyms: ['fer', 'cure de fer', 'complément fer', 'fer bisglycinate', 'sulfate de fer', 'gluconate de fer'] },
    { canonical: 'paracétamol', synonyms: ['doliprane', 'efferalgan', 'dafalgan', 'paracetamol', 'paracétamol'] },
    { canonical: 'ibuprofène', synonyms: ['ibuprofene', 'ibuprofen', 'nurofen', 'advil'] },
    { canonical: 'millepertuis (Hypericum perforatum)', synonyms: ['millepertuis', 'hypericum', 'hypericum perforatum', 'st john', 'st. john'] },
    { canonical: 'rifampicine', synonyms: ['rifampicine', 'rifampin'] },
    { canonical: 'charbon activé', synonyms: ['charbon', 'charbon active', 'charcoal', 'activated charcoal'] },
    { canonical: 'lévothyroxine', synonyms: ['levothyrox', 'lévothyrox', 'levothyroxine', 'levothyrox®'] },
    { canonical: 'amoxicilline', synonyms: ['amoxicilline', 'amoxicillin'] },
  ];

  for (const row of table) {
    if (row.synonyms.some((k) => s.includes(k))) return row;
  }
  return { canonical: raw.trim(), synonyms: [] };
}

type KBItem = InteractionResult;

const LOCAL_KB: Record<string, KBItem> = {
  'fer (sels ferreux: sulfate, gluconate)': {
    interactionLevel: 'faible',
    title: "Fer et contraception hormonale : pas d'interaction cliniquement significative",
    explanation:
      "Le fer est un minéral absorbé au niveau intestinal et n’induit pas les enzymes hépatiques impliquées dans le métabolisme des estroprogestatifs. Il n’altère donc pas l’efficacité contraceptive.",
    scientificBasis:
      "Basé sur la littérature pharmacologique et l’absence de signal d’interaction dans les bases majeures (ANSM, Vidal, DrugBank).",
    sources: [
      { name: 'ANSM – Monographies', url: 'https://ansm.sante.fr' },
      { name: 'Vidal – Interactions', url: 'https://www.vidal.fr' },
      { name: 'DrugBank – Ferrous sulfate', url: 'https://go.drugbank.com' },
    ],
    contraceptionImpact:
      "Aucun effet attendu sur les voies CYP métabolisant les hormones de la pilule.",
    recommendation: {
      timing:
        "Aucun espacement nécessaire pour la contraception. Tu peux espacer pour optimiser l’absorption du fer ou le confort digestif.",
      alternative: '',
    },
  },

  'millepertuis (Hypericum perforatum)': {
    interactionLevel: 'grave',
    title: "Millepertuis et contraception : interaction majeure (induction CYP3A4)",
    explanation:
      "Le millepertuis induit CYP3A4 et la P-gp, ce qui accélère la dégradation des estroprogestatifs et peut réduire l’efficacité contraceptive.",
    scientificBasis: 'Interaction bien documentée par les agences et la littérature.',
    sources: [
      { name: 'ANSM – Avertissements Millepertuis', url: 'https://ansm.sante.fr' },
      { name: 'EMA – Herbal monograph: St John’s wort', url: 'https://www.ema.europa.eu' },
    ],
    contraceptionImpact:
      "Diminution des taux plasmatiques hormonaux → risque de grossesse.",
    recommendation: {
      timing:
        "Évite l’association. Si déjà pris, méthode barrière pendant l’utilisation et 2 semaines après l’arrêt.",
      alternative:
        "Privilégie des options non inductrices pour l’humeur/sommeil (ex. mélatonine courte durée, magnésium), à valider avec un pro de santé.",
    },
  },

  rifampicine: {
    interactionLevel: 'grave',
    title: 'Rifampicine et contraception : interaction majeure (inducteur CYP3A4)',
    explanation:
      "La rifampicine est un puissant inducteur enzymatique, diminuant fortement les concentrations d’ethinylestradiol/progestatifs.",
    scientificBasis: 'Interaction classique bien connue.',
    sources: [
      { name: 'ANSM – Rifampicine', url: 'https://ansm.sante.fr' },
      { name: 'Vidal – Interactions rifampicine', url: 'https://www.vidal.fr' },
    ],
    contraceptionImpact: 'Risque élevé d’échec contraceptif.',
    recommendation: {
      timing:
        "Éviter avec pilules classiques. Utiliser une méthode alternative (DIU, injectable) ou double protection pendant et 4 semaines après.",
      alternative:
        "Méthodes moins dépendantes du CYP (DIU cuivre/hormonal). À discuter avec un pro.",
    },
  },

  'paracétamol': {
    interactionLevel: 'faible',
    title: "Paracétamol et contraception : pas d'interaction significative",
    explanation:
      "Aux doses usuelles, le paracétamol n’induit ni n’inhibe significativement les voies métaboliques des estroprogestatifs.",
    scientificBasis: 'Consensus monographies et bases d’interactions.',
    sources: [
      { name: 'ANSM – Paracétamol', url: 'https://ansm.sante.fr' },
      { name: 'Vidal – Paracétamol', url: 'https://www.vidal.fr' },
    ],
    contraceptionImpact: "Aucun impact attendu sur l’efficacité.",
    recommendation: {
      timing: 'Aucun espacement nécessaire.',
      alternative: '',
    },
  },

  'charbon activé': {
    interactionLevel: 'moyen',
    title: 'Charbon activé et contraception : possible réduction de l’absorption',
    explanation:
      "Le charbon peut adsorber des substances dans l’intestin et diminuer l’absorption s’il est pris très proche de la pilule.",
    scientificBasis: 'Principe d’adsorption intestinal documenté.',
    sources: [{ name: 'ANSM – Charbon activé', url: 'https://ansm.sante.fr' }],
    contraceptionImpact: 'Risque de moindre absorption si prise concomitante.',
    recommendation: {
      timing:
        'Espace d’au moins 3 à 4 heures avec la pilule. Si prise rapprochée, méthode barrière 7 jours.',
      alternative: '',
    },
  },
};

// ------------------------------------------------------

export default function PillMatchChat() {
  const { contraceptive, intakeTime, setContraceptive, setIntakeTime } = useUser();
  const { isBotTyping, setIsBotTyping } = useUI();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [conversationStage, setConversationStage] =
    useState<ConversationStage>('GREETING');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages, isBotTyping]);

  useEffect(() => {
    if (conversationStage === 'GREETING') {
      setIsBotTyping(true);
      setTimeout(() => {
        addBotMessage('Bonjour ! Je suis Lou, ton assistante personnelle de santé.');
        setTimeout(() => {
          addBotMessage(
            'Quelle contraception hormonale utilises-tu et à quelle heure la prends-tu (ou est-ce une diffusion continue) ?'
          );
          setIsBotTyping(false);
          setConversationStage('AWAITING_CONTRACEPTION');
        }, 1200);
      }, 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addBotMessage = (text: string, analysis?: InteractionResult) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, sender: 'bot', text, analysis },
    ]);
  };

  const addUserMessage = (text: string) => {
    const newUserMessage: Message = {
      id: `${Date.now()}-${Math.random()}`,
      sender: 'user',
      text,
    };
    setMessages((prev) => [...prev, newUserMessage]);
    return newUserMessage;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isBotTyping) return;

    addUserMessage(inputValue);
    const currentUserInput = inputValue.trim();
    setInputValue('');

    if (conversationStage === 'AWAITING_CONTRACEPTION') {
      setIsBotTyping(true);

      // Diffusion continue (implant/DIU hormoné/patch/anneau…)
      const isContinuous =
        /diffusion continue|implant|stérilet|sterilet|patch|anneau/i.test(currentUserInput);

      // Heure : "à 8h", "8 h", "07h30", "vers 20h", etc.
      const timeMatch = currentUserInput.match(
        /(?:\b(?:à|a|@|vers)\s*)?([01]?\d|2[0-3])\s*h(?:([0-5]\d))?/i
      );
      const timeText = timeMatch ? `${timeMatch[1]}h${timeMatch[2] ? timeMatch[2] : ''}` : '';

      // Marque/type = texte - heure - mots parasites
      let brandRaw = currentUserInput
        .replace(/(?:\b(?:à|a|@|vers)\s*)?([01]?\d|2[0-3])\s*h(?:([0-5]\d))?/gi, '')
        .replace(/\bet\b/gi, ' ')
        .replace(/[,\.;:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Normalisation simple
      const normalizeMap: Record<string, string> = {
        'ludeal g': 'Ludéal Gé',
        'ludeal ge': 'Ludéal Gé',
        ludeal: 'Ludéal Gé',
        leeloo: 'Leeloo',
        optilova: 'Optilova',
        minidril: 'Minidril',
        jasminelle: 'Jasminelle',
        desogestrel: 'Désogestrel',
        optimizette: 'Optimizette',
        trinordiol: 'Trinordiol',
      };
      const key = brandRaw.toLowerCase();
      const brand = normalizeMap[key] || brandRaw;

      // 1) Diffusion continue
      if (isContinuous) {
        setContraceptive(brand || 'Contraception à diffusion continue');
        setIntakeTime('Diffusion continue');
        setTimeout(() => {
          addBotMessage('Merci, tu utilises une contraception à diffusion continue. C’est noté !');
          setTimeout(() => {
            addBotMessage('Quel médicament, complément ou plante souhaites-tu vérifier ?');
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 600);
        }, 400);
        return;
      }

      // 2) Complétions si moitié déjà fournie
      if (!brand && timeText && contraceptive && !intakeTime) {
        setIntakeTime(timeText);
        setTimeout(() => {
          addBotMessage(`Parfait, c’est noté : ${contraceptive} à ${timeText} ✅`);
          setTimeout(() => {
            addBotMessage('Quel médicament, complément ou plante souhaites-tu vérifier ?');
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 600);
        }, 400);
        return;
      }
      if (brand && !timeText && !contraceptive && intakeTime) {
        setContraceptive(brand);
        setTimeout(() => {
          addBotMessage(`Parfait, c’est noté : ${brand} à ${intakeTime} ✅`);
          setTimeout(() => {
            addBotMessage('Quel médicament, complément ou plante souhaites-tu vérifier ?');
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 600);
        }, 400);
        return;
      }

      // 3) Marque + heure
      if (brand && timeText) {
        setContraceptive(brand);
        setIntakeTime(timeText);
        setTimeout(() => {
          addBotMessage(`Parfait, c’est noté : ${brand} à ${timeText} ✅`);
          setTimeout(() => {
            addBotMessage('Quel médicament, complément ou plante souhaites-tu vérifier ?');
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 600);
        }, 400);
        return;
      }

      // 4) Marque seule
      if (brand && !timeText) {
        setContraceptive(brand);
        setTimeout(() => {
          addBotMessage(`Super, tu utilises ${brand}. À quelle heure la prends-tu ? (ex : 8h ou 20h)`);
          setIsBotTyping(false);
        }, 400);
        return;
      }

      // 5) Heure seule
      if (!brand && timeText) {
        setIntakeTime(timeText);
        setTimeout(() => {
          addBotMessage(
            'Merci ! Et peux-tu me préciser la marque ou le type de ta contraception ? (ex : Leeloo, Optilova, implant, etc.)'
          );
          setIsBotTyping(false);
        }, 400);
        return;
      }

      // 6) Fallback
      setTimeout(() => {
        addBotMessage(
          'Tu peux me dire la marque/type de ta contraception ET l’heure de prise ? Par ex. : Leeloo à 8h, Optilova à 20h, ou implant (diffusion continue).'
        );
        setIsBotTyping(false);
      }, 400);
      return;
    }

    if (conversationStage === 'AWAITING_PRODUCT') {
      setConversationStage('PROCESSING');
      setIsBotTyping(true);
      await handleCheckInteraction(currentUserInput);
      setIsBotTyping(false);
      setConversationStage('AWAITING_PRODUCT'); // prêt pour la suite
      return;
    }
  };

  // -------- helpers parsing Gemini --------
  function stripCodeFences(s: string) {
    const fenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
    const m = s.match(fenceRegex);
    return m?.[1]?.trim() ?? s.trim();
  }

  function tryParseJsonLoose(txt: string): any | null {
    try {
      return JSON.parse(txt);
    } catch {
      const fixed = txt.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(fixed);
      } catch {
        return null;
      }
    }
  }

  const handleCheckInteraction = async (product: string) => {
    if (!product?.trim()) {
      addBotMessage('Peux-tu me donner le nom du médicament/complément à vérifier ?');
      return;
    }

    // Normalisation + KB locale
    const norm = normalizeProduct(product);
    const canonical = norm.canonical;
    const kbHit = LOCAL_KB[canonical];
    if (kbHit) {
      addBotMessage("Merci d'avoir patienté. Voici l'analyse :", kbHit);
      return;
    }

    if (!ai) {
      addBotMessage(
        'Désolée, je ne peux pas effectuer de vérification pour le moment. Clé API manquante (VITE_API_KEY / VITE_GEMINI_API_KEY).'
      );
      return;
    }

    const prompt = `
Tu es "Lou", assistante santé. Analyse l'interaction entre une contraception hormonale et un produit.

CONTRAINTE: Réponds en UN SEUL objet JSON, sans Markdown, en français, en tutoyant, avec ce schéma:
{
  "interactionLevel": "faible" | "moyen" | "grave" | "inconnu",
  "title": "...",
  "explanation": "...",
  "scientificBasis": "...",
  "sources": [ { "name": "...", "url": "https://..." } ],
  "contraceptionImpact": "...",
  "recommendation": { "timing": "...", "alternative": "..." }
}

Contexte utilisateur:
- Contraception: "${contraceptive}"
- Heure/méthode: "${intakeTime}"
- Produit: "${canonical}"

RÈGLES:
- Inducteurs enzymatiques (ex: millepertuis, rifampicine) -> souvent "grave".
- Adsorbants (charbon activé) -> "moyen" si prises concomitantes (séparer les prises).
- Compléments minéraux comme le fer n’induisent/ n’inhibent pas le CYP3A4 -> généralement "faible".
- Si la littérature ne signale pas d’interaction cliniquement significative, préfère "faible" à "inconnu" et explique pourquoi.
`.trim();

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', temperature: 0.3 },
      });

      const rawText =
        (response as any)?.text?.trim?.() ||
        (response as any)?.response?.text?.()?.trim?.() ||
        '';

      if (!rawText) {
        addBotMessage(
          'Je n’ai pas réussi à obtenir une réponse. Réessaie avec le nom exact du produit.'
        );
        return;
      }

      const body = stripCodeFences(rawText);
      let parsed: InteractionResult | null = tryParseJsonLoose(body);

      if (!parsed?.interactionLevel) {
        addBotMessage(
          "Réponse incomplète. Peux-tu préciser la forme/marque exacte du produit ?"
        );
        return;
      }

      addBotMessage("Merci d'avoir patienté. Voici l'analyse :", parsed);
    } catch (err: any) {
      const message = err?.message || 'Erreur inconnue';
      addBotMessage(
        `Désolée, une erreur est survenue lors de l'analyse (${message}). Réessaie dans un instant.`
      );
    }
  };

  const getStatusIcon = (level: InteractionResult['interactionLevel']) => {
    switch (level) {
      case 'faible':
        return { icon: 'check_circle', label: 'Faible' };
      case 'moyen':
        return { icon: 'warning', label: 'Moyen' };
      case 'grave':
        return { icon: 'error', label: 'Élevé' };
      case 'inconnu':
      default:
        return { icon: 'help', label: 'Inconnu' };
    }
  };

  return (
    <div className="chat-container">
      <div className="lou-character-container">
        <div className="lou-character lou-blob-1"></div>
        <div className="lou-character lou-blob-2"></div>
        <div className="lou-character lou-blob-3"></div>
      </div>

      {!ai && (
        <div className="error-banner">
          Clé API manquante (VITE_API_KEY / VITE_GEMINI_API_KEY). L'application ne
          peut pas fonctionner.
        </div>
      )}

      <div className="messages-list">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message-bubble ${msg.sender === 'bot' ? 'bot-message' : 'user-message'}`}
          >
            {msg.text && <p>{msg.text}</p>}
            {msg.analysis && (
              <div className={`analysis-card level-${msg.analysis.interactionLevel}`}>
                <div className="analysis-header">
                  <span className={`icon level-icon`}>
                    {getStatusIcon(msg.analysis.interactionLevel).icon}
                  </span>
                  <div className="header-text">
                    <h4>
                      Niveau d'interaction : {getStatusIcon(msg.analysis.interactionLevel).label}
                    </h4>
                    <h5>{msg.analysis.title}</h5>
                  </div>
                </div>
                <div className="analysis-section">
                  <strong>Pourquoi ?</strong>
                  <p>{msg.analysis.explanation}</p>
                </div>
                <div className="analysis-section">
                  <strong>Impact sur ta contraception</strong>
                  <p>{msg.analysis.contraceptionImpact}</p>
                </div>
                <div className="analysis-section recommendation">
                  <strong>
                    <span className="icon">recommend</span> Recommandation
                  </strong>
                  <p>{msg.analysis.recommendation.timing}</p>
                  {msg.analysis.recommendation.alternative && (
                    <p>
                      <strong>Alternative : </strong>
                      {msg.analysis.recommendation.alternative}
                    </p>
                  )}
                </div>
                <div className="analysis-section sources">
                  <p>
                    <strong>Sources : </strong>
                    {msg.analysis.scientificBasis}
                  </p>
                  <ul>
                    {msg.analysis.sources.map((source) => (
                      <li key={source.name}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}
        {isBotTyping && (
          <div className="message-bubble bot-message">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={isBotTyping ? "Lou est en train d'écrire..." : 'Écris ton message...'}
          disabled={isBotTyping || conversationStage === 'GREETING' || !ai}
        />
        <button type="submit" disabled={!inputValue.trim() || isBotTyping || !ai}>
          <span className="icon">send</span>
        </button>
      </form>
    </div>
  );
}
