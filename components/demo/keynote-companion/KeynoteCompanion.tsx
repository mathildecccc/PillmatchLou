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
      }, 1000);
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

      const isContinuous = /diffusion continue|implant|stérilet|sterilet|patch|anneau/i.test(
        currentUserInput
      );

      // 1) Heure : "à 8h", "8 h", "07h30", "vers 20h", etc.
      const timeMatch = currentUserInput.match(
        /(?:\b(?:à|a|@|vers)\s*)?([01]?\d|2[0-3])\s*h(?:([0-5]\d))?/i
      );
      const timeText = timeMatch
        ? `${timeMatch[1]}h${timeMatch[2] ? timeMatch[2] : ''}`
        : '';

      // 2) "Marque/type" = texte - heure - mots parasites
      let brandRaw = currentUserInput
        .replace(
          /(?:\b(?:à|a|@|vers)\s*)?([01]?\d|2[0-3])\s*h(?:([0-5]\d))?/gi,
          ''
        )
        .replace(/\bet\b/gi, ' ')
        .replace(/[,\.;:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 3) Normalisation simple (ajoute au besoin)
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

      if (isContinuous) {
        setContraceptive(brand || 'Contraception à diffusion continue');
        setIntakeTime('Diffusion continue');
        setTimeout(() => {
          addBotMessage(
            'Merci, tu utilises donc une contraception à diffusion continue. C’est bien noté !'
          );
          setTimeout(() => {
            addBotMessage(
              'Quel médicament, complément ou plante souhaites-tu vérifier ?'
            );
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 800);
        }, 600);
        return;
      }

      if (brand && timeText) {
        setContraceptive(brand);
        setIntakeTime(timeText);
        setTimeout(() => {
          addBotMessage(`Parfait, c’est noté : **${brand}** à **${timeText}** ✅`);
          setTimeout(() => {
            addBotMessage(
              'Quel médicament, complément ou plante souhaites-tu vérifier ?'
            );
            setIsBotTyping(false);
            setConversationStage('AWAITING_PRODUCT');
          }, 800);
        }, 600);
        return;
      }

      if (brand && !timeText) {
        setTimeout(() => {
          addBotMessage(
            `Super, tu utilises **${brand}**. Peux-tu me dire **à quelle heure** tu la prends ? (ex : 8h ou 20h)`
          );
          setIsBotTyping(false);
        }, 600);
        return;
      }

      if (!brand && timeText) {
        setTimeout(() => {
          addBotMessage(
            `Merci ! Et peux-tu me préciser **la marque** ou **le type** de ta contraception ? (ex : Leeloo, Optilova, implant, etc.)`
          );
          setIsBotTyping(false);
        }, 600);
        return;
      }

      setTimeout(() => {
        addBotMessage(
          'Tu peux me dire **la marque/type** de ta contraception **et** l’**heure** de prise ? Par ex. : _Leeloo à 8h_, _Optilova à 20h_, ou _implant (diffusion continue)_.'
        );
        setIsBotTyping(false);
      }, 600);
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

  // -------- helpers parsing --------
  function stripCodeFences(s: string) {
    const fenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
    const m = s.match(fenceRegex);
    return m?.[1]?.trim() ?? s.trim();
  }

  function tryParseJsonLoose(txt: string): any | null {
    try {
      return JSON.parse(txt);
    } catch {
      // petites réparations triviales
      const fixed = txt.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(fixed);
      } catch {
        return null;
      }
    }
  }

  const handleCheckInteraction = async (product: string) => {
    if (!ai) {
      addBotMessage(
        "Désolée, je ne peux pas effectuer de vérification pour le moment. Clé API manquante (VITE_API_KEY / VITE_GEMINI_API_KEY)."
      );
      return;
    }

    const prompt = `
You are "Lou", a warm and reassuring chatbot assistant. Your goal is to guide the user in understanding interactions between their hormonal contraception and other products.
The user's data is:
- Contraception: "${contraceptive}"
- Intake Time/Method: "${intakeTime}"
- Product to check: "${product}"

Your task is to provide a detailed, scientifically-backed analysis. Your response MUST be a single, valid JSON object, with no markdown formatting.

The JSON object structure is:
{
  "interactionLevel": "faible" | "moyen" | "grave" | "inconnu",
  "title": "A short summary of the interaction level with the product name.",
  "explanation": "A simple, easy-to-understand explanation of why there is or isn't an interaction. Use scientific popularization. Write in French and use 'tu'.",
  "scientificBasis": "A sentence stating the source of your information, like 'This analysis is based on data from the French National Agency for the Safety of Medicines (ANSM) and the DrugBank database.'",
  "sources": [
    { "name": "Name of the source (e.g., ANSM, Vidal, DrugBank)", "url": "A direct URL to the relevant information if possible, otherwise to the main site. Must be a real, verifiable URL." }
  ],
  "contraceptionImpact": "Specifically explain how this product can affect the user's contraception (enzymes CYP, absorption, etc.).",
  "recommendation": {
    "timing": "Provide clear advice on timing in French, or say 'Aucun espacement nécessaire'.",
    "alternative": "If risk is medium or high, suggest a safer alternative commonly used in France."
  }
}

RULES:
1) Base your analysis on verified, open-access scientific data (ANSM, EMA, Vidal, DrugBank, PubMed).
2) You MUST provide real sources in the 'sources' array.
3) Be reassuring and clear in French. Use 'tu'.
4) If no information is found, set 'interactionLevel' to "inconnu" and explain.
`.trim();

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' },
      });

      // Selon version du SDK
      const rawText =
        (response as any)?.text?.trim?.() ||
        (response as any)?.response?.text?.()?.trim?.() ||
        '';

      if (!rawText) {
        console.error('Réponse vide/inattendue:', response);
        addBotMessage(
          "Désolée, je n’ai pas réussi à traiter la réponse. Réessaie dans un instant."
        );
        return;
      }

      let jsonStr = stripCodeFences(rawText);
      let parsed = tryParseJsonLoose(jsonStr) as InteractionResult | null;

      if (!parsed || !parsed.interactionLevel || !parsed.recommendation) {
        console.warn('JSON incomplet ou non parsable:', jsonStr);
        addBotMessage(
          "J’ai reçu une réponse incomplète. Réessaie en précisant le produit exact (ex : 'millepertuis Arkopharma')."
        );
        return;
      }

      addBotMessage("Merci d'avoir patienté. Voici l'analyse :", parsed);
    } catch (err: any) {
      console.error('Erreur API Gemini:', err);
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
                      Niveau d'interaction :{' '}
                      {getStatusIcon(msg.analysis.interactionLevel).label}
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
