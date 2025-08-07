/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { useUser, useUI } from '@/lib/state';

const API_KEY = import.meta.env.VITE_API_KEY;

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
}

type ConversationStage = 'GREETING' | 'AWAITING_CONTRACEPTION' | 'AWAITING_PRODUCT' | 'PROCESSING' | 'DONE';

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
  const [conversationStage, setConversationStage] = useState<ConversationStage>('GREETING');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, isBotTyping]);

  useEffect(() => {
    if (conversationStage === 'GREETING') {
      setIsBotTyping(true);
      setTimeout(() => {
        addBotMessage("Bonjour ! Je suis Lou, ton assistante personnelle de santé.");
        setTimeout(() => {
            addBotMessage("Quelle contraception hormonale utilises-tu et à quelle heure la prends-tu (ou est-ce une diffusion continue) ?");
            setIsBotTyping(false);
            setConversationStage('AWAITING_CONTRACEPTION');
        }, 1200);
      }, 1000);
    }
  }, []);

  const addBotMessage = (text: string, analysis?: InteractionResult) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'bot', text, analysis }]);
  };

  const addUserMessage = (text: string) => {
    const newUserMessage: Message = { id: Date.now().toString(), sender: 'user', text };
    setMessages(prev => [...prev, newUserMessage]);
    return newUserMessage;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isBotTyping) return;

    addUserMessage(inputValue);
    const currentUserInput = inputValue;
    setInputValue('');

    if (conversationStage === 'AWAITING_CONTRACEPTION') {
        setConversationStage('PROCESSING');
        setIsBotTyping(true);
        // Simple parsing for demo purposes
        const parts = currentUserInput.split(/ à | at /i);
        setContraceptive(parts[0].trim());
        setIntakeTime(parts[1] ? parts[1].trim() : 'Continue');

        setTimeout(() => {
            addBotMessage("Parfait, c'est noté !");
            setTimeout(() => {
                addBotMessage("Maintenant, quel médicament, complément ou plante souhaites-tu vérifier ?");
                setIsBotTyping(false);
                setConversationStage('AWAITING_PRODUCT');
            }, 1000);
        }, 1000);
    } else if (conversationStage === 'AWAITING_PRODUCT') {
        setConversationStage('PROCESSING');
        setIsBotTyping(true);
        await handleCheckInteraction(currentUserInput);
        setIsBotTyping(false);
        setConversationStage('AWAITING_PRODUCT'); // Ready for next check
    }
  };

  const handleCheckInteraction = async (product: string) => {
    if (!ai) {
        addBotMessage("Désolée, je ne peux pas effectuer de vérification pour le moment. La configuration de l'API est manquante.");
        return;
    }

    const prompt = `
    You are "Lou", a warm and reassuring chatbot assistant. Your goal is to guide the user in understanding interactions between their hormonal contraception and other products.
    The user's data is:
    - Contraception: "${contraceptive}"
    - Intake Time/Method: "${intakeTime}"
    - Product to check: "${product}"

    Your task is to provide a detailed, scientifically-backed analysis. Your response MUST be a single, valid JSON object, with no markdown formatting (like \`\`\`json).

    The JSON object structure is:
    {
      "interactionLevel": "faible" | "moyen" | "grave" | "inconnu",
      "title": "A short summary of the interaction level with the product name.",
      "explanation": "A simple, easy-to-understand explanation of why there is or isn't an interaction. Use scientific popularization.",
      "scientificBasis": "A sentence stating the source of your information, like 'This analysis is based on data from the French National Agency for the Safety of Medicines (ANSM) and the DrugBank database.'",
      "sources": [
        { "name": "Name of the source (e.g., ANSM, Vidal, DrugBank)", "url": "A direct URL to the relevant information if possible, otherwise to the main site. Must be a real, verifiable URL." }
      ],
      "contraceptionImpact": "Specifically explain how this product can affect the user's contraception. For example, by affecting liver enzymes, reducing absorption, etc.",
      "recommendation": {
        "timing": "Provide clear advice on timing. For example, 'It is advisable to wait at least X hours between taking your pill and this product.' or 'No specific timing is needed.'",
        "alternative": "If there is a medium or severe risk, suggest a safer alternative product. Preferably a common French brand. Explain why it is safer. For example, 'For pain relief, Paracetamol (like Doliprane) is a safer alternative as it does not typically interact with hormonal contraceptives.'"
      }
    }

    RULES:
    1. MANDATORY: Base your analysis on verified, open-access scientific data (e.g., ANSM, EMA, Vidal, DrugBank, PubMed).
    2. MANDATORY: You MUST provide the sources in the \`sources\` array.
    3. Be reassuring and clear in your language, in French.
    4. If no information is found, set \`interactionLevel\` to "inconnu" and explain that there is not enough data to be certain.
    5. IMPORTANT: In all your French text explanations and recommendations, you MUST address the user with "tu" (informal you), not "vous".
    `;

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" },
        });

        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }

        const parsedResult: InteractionResult = JSON.parse(jsonStr);
        addBotMessage("Merci d'avoir patienté. Voici l'analyse :", parsedResult);

    } catch (e) {
      console.error(e);
      addBotMessage("Désolée, une erreur est survenue lors de l'analyse. Pourrais-tu essayer de reformuler ou de vérifier ta connexion ?");
    }
  };
  
  const getStatusIcon = (level: InteractionResult['interactionLevel']) => {
    switch (level) {
        case 'faible': return { icon: 'check_circle', label: 'Faible'};
        case 'moyen': return { icon: 'warning', label: 'Moyen'};
        case 'grave': return { icon: 'error', label: 'Élevé'};
        case 'inconnu':
        default: return { icon: 'help', label: 'Inconnu'};
    }
  }


  return (
    <div className="chat-container">
        <div className="lou-character-container">
            <div className="lou-character lou-blob-1"></div>
            <div className="lou-character lou-blob-2"></div>
            <div className="lou-character lou-blob-3"></div>
        </div>
        {!ai && <div className="error-banner">Clé API GEMINI_API_KEY manquante. L'application ne peut pas fonctionner.</div>}
        <div className="messages-list">
            {messages.map(msg => (
                <div key={msg.id} className={`message-bubble ${msg.sender === 'bot' ? 'bot-message' : 'user-message'}`}>
                   {msg.text && <p>{msg.text}</p>}
                   {msg.analysis && (
                       <div className={`analysis-card level-${msg.analysis.interactionLevel}`}>
                           <div className="analysis-header">
                               <span className={`icon level-icon`}>{getStatusIcon(msg.analysis.interactionLevel).icon}</span>
                               <div className="header-text">
                                  <h4>Niveau d'interaction : {getStatusIcon(msg.analysis.interactionLevel).label}</h4>
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
                               <strong><span className="icon">recommend</span> Recommandation</strong>
                               <p>{msg.analysis.recommendation.timing}</p>
                               {msg.analysis.recommendation.alternative && <p><strong>Alternative : </strong>{msg.analysis.recommendation.alternative}</p>}
                           </div>
                            <div className="analysis-section sources">
                               <p><strong>Sources : </strong>{msg.analysis.scientificBasis}</p>
                               <ul>
                                   {msg.analysis.sources.map(source => (
                                       <li key={source.name}>
                                           <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>
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
                        <span></span><span></span><span></span>
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
                placeholder={isBotTyping ? "Lou est en train d'écrire..." : "Écris ton message..."}
                disabled={isBotTyping || conversationStage === 'GREETING' || !ai}
            />
            <button type="submit" disabled={!inputValue.trim() || isBotTyping || !ai}>
                <span className="icon">send</span>
            </button>
        </form>
    </div>
  );
}
