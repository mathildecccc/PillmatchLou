/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { useUser, useUI } from '@/lib/state';

// -------------- API KEY --------------
const API_KEY =
  import.meta.env.VITE_API_KEY ||
  import.meta.env.VITE_GEMINI_API_KEY ||
  import.meta.env.GEMINI_API_KEY ||
  '';

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
}

// -------------- Types --------------
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

type InteractionLevel = 'faible' | 'moyen' | 'grave' | 'inconnu';

type InteractionResult = {
  interactionLevel: InteractionLevel;
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

// -------------- Helpers: emojis & badges --------------
function badgeMeta(level: InteractionLevel) {
  switch (level) {
    case 'faible':
      return { emoji: '🟢', icon: 'check_circle', label: 'Faible' };
    case 'moyen':
      return { emoji: '🟠', icon: 'warning', label: 'Modérée' };
    case 'grave':
      return { emoji: '🔴', icon: 'error', label: 'Élevée' };
    case 'inconnu':
    default:
      return { emoji: '⚪', icon: 'help', label: 'Inconnue' };
  }
}

// -------------- Normalisation produit + KB locale --------------
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
    { canonical: 'vitamine c (acide ascorbique)', synonyms: ['vitamine c', 'acide ascorbique', 'vit c'] },
    { canonical: 'collagène', synonyms: ['collagene', 'cure collagène', 'luxéol 3 mois', 'luxeol', 'luxéol'] },
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
      "Le fer est absorbé dans l’intestin et n’active pas les enzymes du foie qui éliminent les hormones de la pilule. Il ne réduit donc pas l’efficacité contraceptive.",
    scientificBasis:
      "Basé sur la littérature pharmacologique et l’absence de signal d’interaction dans ANSM, Vidal et DrugBank.",
    sources: [
      { name: 'ANSM – Monographies', url: 'https://ansm.sante.fr' },
      { name: 'Vidal – Interactions', url: 'https://www.vidal.fr' },
      { name: 'DrugBank – Ferrous sulfate', url: 'https://go.drugbank.com' },
    ],
    contraceptionImpact: "Aucun effet attendu sur les voies métaboliques des estroprogestatifs.",
    recommendation: {
      timing: "Aucun espacement nécessaire pour la contraception. Tu peux espacer si tu veux optimiser l’absorption du fer (éviter café/thé juste avant).",
      alternative: '',
    },
  },
  'millepertuis (Hypericum perforatum)': {
    interactionLevel: 'grave',
    title: "Millepertuis et contraception : interaction majeure",
    explanation:
      "Le millepertuis accélère l’élimination de nombreux médicaments (CYP3A4, P-gp). Les hormones de la pilule sont éliminées plus vite → efficacité réduite.",
    scientificBasis: 'Interaction bien documentée par les agences de santé.',
    sources: [
      { name: 'ANSM – Avertissements Millepertuis', url: 'https://ansm.sante.fr' },
      { name: 'EMA – Monograph: St John’s wort', url: 'https://www.ema.europa.eu' },
    ],
    contraceptionImpact:
      "Baisse des taux hormonaux → risque de grossesse.",
    recommendation: {
      timing:
        "Évite l’association. Si déjà pris : préservatif pendant toute la prise + 2 semaines après l’arrêt.",
      alternative:
        "Options non inductrices pour l’humeur/sommeil (ex. magnésium, mélatonine courte durée) — à valider avec un pro de santé.",
    },
  },
  rifampicine: {
    interactionLevel: 'grave',
    title: 'Rifampicine et contraception : interaction majeure',
    explanation:
      "Puissant inducteur enzymatique : les concentrations d’éthinylestradiol/progestatifs chutent fortement.",
    scientificBasis: 'Interaction classique et bien connue.',
    sources: [
      { name: 'ANSM – Rifampicine', url: 'https://ansm.sante.fr' },
      { name: 'Vidal – Interactions rifampicine', url: 'https://www.vidal.fr' },
    ],
    contraceptionImpact: 'Risque élevé d’échec contraceptif.',
    recommendation: {
      timing:
        "Éviter avec les pilules classiques. Utiliser double protection durant la cure + 4 semaines après.",
      alternative:
        "Méthodes moins dépendantes du CYP (DIU cuivre/hormonal) — à discuter avec un pro.",
    },
  },
  'paracétamol': {
    interactionLevel: 'faible',
    title: "Paracétamol et contraception : pas d'interaction significative",
    explanation:
      "Aux doses usuelles, le paracétamol ne modifie pas significativement l’élimination des hormones de la pilule.",
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
      "Le charbon adsorbe des molécules dans l’intestin. Pris trop près de la pilule, il peut en diminuer l’absorption.",
    scientificBasis: 'Principe d’adsorption intestinal documenté.',
    sources: [{ name: 'ANSM – Charbon activé', url: 'https://ansm.sante.fr' }],
    contraceptionImpact: 'Risque de moindre absorption si prises concomitantes.',
    recommendation: {
      timing:
        'Sépare d’au moins 3–4 heures avec la pilule. Si prises trop proches : préservatif 7 jours.',
      alternative: '',
    },
  },
  'vitamine c (acide ascorbique)': {
    interactionLevel: 'faible',
    title: "Vitamine C et contraception : pas d'interaction significative",
    explanation:
      "Aux doses usuelles, la vitamine C n’induit ni n’inhibe de façon notable le métabolisme des estroprogestatifs.",
    scientificBasis: 'Absence de signal d’interaction dans les bases majeures.',
    sources: [
      { name: 'ANSM – Vitamine C', url: 'https://ansm.sante.fr' },
      { name: 'Vidal – Vitamine C', url: 'https://www.vidal.fr' },
    ],
    contraceptionImpact: 'Aucun impact significatif attendu sur l’efficacité.',
    recommendation: { timing: 'Aucun espacement nécessaire.', alternative: '' },
  },
  'collagène': {
    interactionLevel: 'faible',
    title: "Collagène et contraception : pas d'interaction attendue",
    explanation:
      "Le collagène est une protéine/peptides sans effet inducteur ou inhibiteur documenté sur le métabolisme des hormones de la pilule.",
    scientificBasis: 'Absence de signal d’interaction dans la littérature et bases.',
    sources: [
      { name: 'ANSM – Compléments', url: 'https://ansm.sante.fr' },
      { name: 'Vidal – Compléments', url: 'https://www.vidal.fr' },
    ],
    contraceptionImpact: 'Impact négligeable attendu.',
    recommendation: { timing: 'Pas de contrainte particulière.', alternative: '' },
  },
};

// -------------- Component --------------
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
        addBotMessage('Bonjour ! Je suis Lou, ton assistante personnelle de santé 🤝');
        setTimeout(() => {
          addBotMessage(
            'Quelle contraception hormonale utilises-tu, et à quelle heure tu la prends ? (ou dis-moi si c’est une diffusion continue) ⏰'
          );
          setIsBotTyping(false);
          setConversationStage('AWAITING_CONTRACEPTION');
        }, 1000);
      }, 600);
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

  // ----------- Send message -----------
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isBotTyping) return;

    addUserMessage(inputValue);
    const currentUserInput = inputValue.trim();
    setInputValue('');

    if (conversationStage === 'AWAITING_CONTRACEPTION') {
      setIsBotTyping(true);

      // Diffusion continue
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
        'ludeal': 'Ludéal Gé',
        'leeloo': 'Leeloo',
        'optilova': 'Optilova',
        'minidril': 'Minidril',
        'jasminelle': 'Jasminelle',
        'desogestrel': 'Désogestrel',
        'optimizette': 'Optimizette',
        'trinordiol': 'Trinordiol',
      };
      const key = brandRaw.toLowerCase();
      const brand = normalizeMap[key] || brandRaw;

      // 1) Diffusion continue
      if (isContinuous) {
        setContraceptive(brand || 'Contraception à diffusion continue');
        setIntakeTime('Diffusion continue');
        setTimeout(() => {
          addBotMessage('Merci, tu utilises une contraception à diffusion continue. C’est noté ✅');
          setTimeout(() => {
            addBotMessage('Quel médicament, complément ou plante souhaites-tu vérifier ? 🌿💊');
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 500);
        }, 300);
        return;
      }

      // 2) Complétions si moitié déjà fournie
      if (!brand && timeText && contraceptive && !intakeTime) {
        setIntakeTime(timeText);
        setTimeout(() => {
          addBotMessage(`Parfait, c’est noté : ${contraceptive} à ${timeText} ✅`);
          setTimeout(() => {
            addBotMessage('Quel médicament, complément ou plante souhaites-tu vérifier ? 🌿💊');
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 500);
        }, 300);
        return;
      }
      if (brand && !timeText && !contraceptive && intakeTime) {
        setContraceptive(brand);
        setTimeout(() => {
          addBotMessage(`Parfait, c’est noté : ${brand} à ${intakeTime} ✅`);
          setTimeout(() => {
            addBotMessage('Quel médicament, complément ou plante souhaites-tu vérifier ? 🌿💊');
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 500);
        }, 300);
        return;
      }

      // 3) Marque + heure
      if (brand && timeText) {
        setContraceptive(brand);
        setIntakeTime(timeText);
        setTimeout(() => {
          addBotMessage(`Parfait, c’est noté : ${brand} à ${timeText} ✅`);
          setTimeout(() => {
            addBotMessage('Quel médicament, complément ou plante souhaites-tu vérifier ? 🌿💊');
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 500);
        }, 300);
        return;
      }

      // 4) Marque seule
      if (brand && !timeText) {
        setContraceptive(brand);
        setTimeout(() => {
          addBotMessage(`Super, tu utilises ${brand}. À quelle heure la prends-tu ? (ex : 8h ou 20h) ⏰`);
          setIsBotTyping(false);
        }, 300);
        return;
      }

      // 5) Heure seule
      if (!brand && timeText) {
        setIntakeTime(timeText);
        setTimeout(() => {
          addBotMessage('Merci ! Et peux-tu me préciser la marque ou le type de ta contraception ? (ex : Leeloo, Optilova, implant…)');
          setIsBotTyping(false);
        }, 300);
        return;
      }

      // 6) Fallback
      setTimeout(() => {
        addBotMessage('Tu peux me dire la marque/type de ta contraception ET l’heure de prise ? Par ex. : Leeloo à 8h, Optilova à 20h, ou implant (diffusion continue).');
        setIsBotTyping(false);
      }, 300);
      return;
    }

    if (conversationStage === 'AWAITING_PRODUCT') {
      setConversationStage('PROCESSING');
      setIsBotTyping(true);
      await handleCheckInteraction(currentUserInput);
      setIsBotTyping(false);
      setConversationStage('AWAITING_PRODUCT');
      return;
    }
  };

  // -------- Helpers parsing/cleanup --------
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

  function sanitizeSources(sources: { name: string; url: string }[] | undefined) {
    if (!Array.isArray(sources)) return [];
    return sources.filter((s) => typeof s?.url === 'string' && /^https?:\/\//i.test(s.url));
  }

  // Post-traitement : adapter le conseil selon diffusion continue / niveau
  function adaptAnalysisToContext(result: InteractionResult): InteractionResult {
    const isContinuous =
      (intakeTime || '').toLowerCase().includes('diffusion') ||
      /implant|anneau|patch|stérilet|sterilet/i.test(contraceptive || '');

    const out: InteractionResult = {
      ...result,
      sources: sanitizeSources(result.sources),
      recommendation: { ...result.recommendation },
    };

    // Règles génériques d’espacement si pas explicitement donné
    if (!out.recommendation.timing || !out.recommendation.timing.trim()) {
      if (result.interactionLevel === 'faible') {
        out.recommendation.timing = 'Aucun espacement nécessaire.';
      } else if (result.interactionLevel === 'moyen') {
        out.recommendation.timing = 'Sépare d’au moins 3–4 heures avec ta contraception.';
      } else if (result.interactionLevel === 'grave') {
        out.recommendation.timing = 'Évite l’association. Utilise une méthode barrière et demande conseil à un pro de santé.';
      } else {
        out.recommendation.timing = 'Données limitées : demande l’avis de ton pharmacien/médecin.';
      }
    }

    // Ajustement pour diffusion continue : rappeler le risque global
    if (isContinuous && result.interactionLevel !== 'faible') {
      out.explanation = `${out.explanation} Dans ton cas (diffusion continue), le risque d’interaction concerne toute la durée d’action du dispositif.`;
    }

    return out;
  }

  // ---------- Appel IA + KB ----------
  const handleCheckInteraction = async (product: string) => {
    if (!product?.trim()) {
      addBotMessage('Peux-tu me donner le nom du médicament ou complément à vérifier ? 😊');
      return;
    }

    // 1) KB locale (réponse instant)
    const norm = normalizeProduct(product);
    const canonical = norm.canonical;
    const kbHit = LOCAL_KB[canonical];
    if (kbHit) {
      addBotMessage("Merci d'avoir patienté. Voici l'analyse :", adaptAnalysisToContext(kbHit));
      return;
    }

    // 2) IA si pas dans la KB
    if (!ai) {
      addBotMessage(
        'Désolée, je ne peux pas faire la vérification pour le moment. Clé API manquante (VITE_API_KEY / VITE_GEMINI_API_KEY).'
      );
      return;
    }

    // Prompt orienté pédagogie + spacing + alternatives
    const prompt = `
Tu es "Lou", une coach santé claire et rassurante. Tu analyses l'interaction entre une contraception hormonale et un produit.
Réponds en UN SEUL objet JSON strict (pas de Markdown), en français, avec ce schéma :
{
  "interactionLevel": "faible" | "moyen" | "grave" | "inconnu",
  "title": "verdict court et clair",
  "explanation": "vulgarisation simple : 2-3 phrases max (tutoie)",
  "scientificBasis": "phrase sur les sources utilisées",
  "sources": [ { "name": "nom source", "url": "https://..." } ],
  "contraceptionImpact": "impact concret sur la pilule (absorption, enzymes, etc.)",
  "recommendation": {
    "timing": "conseil pratique (ex : 'Aucun espacement nécessaire' / 'Espace de 3–4 h' / 'Évite l’association, préservatif X jours/semaines')",
    "alternative": "si risque moyen/élevé : produit(s) plus sûrs en France ; sinon chaîne vide"
  }
}
Rappelle-toi : si les bases fiables ne signalent pas d’interaction cliniquement significative → 'faible' plutôt que 'inconnu' et explique pourquoi.

Contexte:
- Contraception: "${contraceptive || 'non précisé'}"
- Heure/méthode: "${intakeTime || 'non précisé'}"
- Produit: "${canonical}"

Utilise des sources publiques fiables (ANSM, EMA, Vidal, DrugBank, NHS, BNF). Les URLs doivent être valides (https).
`.trim();

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });

      const rawText =
        (response as any)?.text?.trim?.() ||
        (response as any)?.response?.text?.()?.trim?.() ||
        '';

      if (!rawText) {
        addBotMessage('Je n’ai pas réussi à obtenir une réponse. Réessaie avec le nom exact du produit 🙏');
        return;
      }

      const body = stripCodeFences(rawText);
      let parsed: InteractionResult | null = tryParseJsonLoose(body);

      if (!parsed?.interactionLevel) {
        addBotMessage("Réponse incomplète. Peux-tu préciser la forme/marque exacte du produit ?");
        return;
      }

      const adapted = adaptAnalysisToContext(parsed);
      addBotMessage("Merci d'avoir patienté. Voici l'analyse :", adapted);
    } catch (err: any) {
      const message = err?.message || 'Erreur inconnue';
      addBotMessage(`Désolée, une erreur est survenue lors de l'analyse (${message}). Réessaie dans un instant 🙏`);
    }
  };

  // ---------- UI helpers ----------
  const getStatusIcon = (level: InteractionLevel) => badgeMeta(level).icon;

  // -------------- Render --------------
  return (
    <div className="chat-container">
      <div className="lou-character-container">
        <div className="lou-character lou-blob-1"></div>
        <div className="lou-character lou-blob-2"></div>
        <div className="lou-character lou-blob-3"></div>
      </div>

      {!ai && (
        <div className="error-banner">
          Clé API manquante (VITE_API_KEY / VITE_GEMINI_API_KEY). L'application ne peut pas fonctionner.
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
                  <span className="level-emoji" aria-hidden>
                    {badgeMeta(msg.analysis.interactionLevel).emoji}
                  </span>
                  <span className={`icon level-icon`}>{getStatusIcon(msg.analysis.interactionLevel)}</span>
                  <div className="header-text">
                    <h4>
                      Niveau d'interaction : {badgeMeta(msg.analysis.interactionLevel).label}
                    </h4>
                    <h5>{msg.analysis.title}</h5>
                  </div>
                </div>

                {/* Contraception context note */}
                {(intakeTime?.toLowerCase().includes('diffusion') ||
                  /implant|anneau|patch|stérilet|sterilet/i.test(contraceptive || '')) && (
                  <div className="analysis-section hint">
                    <strong>Contexte :</strong>{' '}
                    <span>
                      Ta contraception est à diffusion continue. Les recommandations tiennent compte de ce mode d’action. ✨
                    </span>
                  </div>
                )}

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
                  {msg.analysis.recommendation.alternative && msg.analysis.recommendation.alternative.trim() && (
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
                    {msg.analysis.sources
                      .filter((s) => typeof s?.url === 'string' && /^https?:\/\//i.test(s.url))
                      .map((source) => (
                        <li key={`${source.name}-${source.url}`}>
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
