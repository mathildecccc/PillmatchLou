/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { Agent, createNewAgent } from './presets/agents';

/**
 * User Health Profile
 */
export type UserProfile = {
  contraceptive: string;
  intakeTime: string;
  otherMedications?: string;
};

export const useUser = create<
  {
    setContraceptive: (contraceptive: string) => void;
    setIntakeTime: (intakeTime: string) => void;
    setOtherMedications: (otherMedications: string) => void;
  } & UserProfile
>(set => ({
  contraceptive: '',
  intakeTime: '',
  otherMedications: '',
  setContraceptive: contraceptive => set({ contraceptive }),
  setIntakeTime: intakeTime => set({ intakeTime }),
  setOtherMedications: otherMedications => set({ otherMedications }),
}));


/**
 * UI
 */
export const useUI = create<{
  isBotTyping: boolean;
  setIsBotTyping: (isTyping: boolean) => void;
}>(set => ({
  isBotTyping: false,
  setIsBotTyping: (isTyping: boolean) => set({ isBotTyping: isTyping }),
}));

export type User = {
  name: string;
  info: string;
};

export const useAgent = create<{
  current: Agent;
  update: (id: string, adjustments: Partial<Agent>) => void;
}>(set => ({
  current: createNewAgent(),
  update: (id, adjustments) =>
    set(state => ({
      current:
        state.current.id === id
          ? { ...state.current, ...adjustments }
          : state.current,
    })),
}));