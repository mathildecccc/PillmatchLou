/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import Modal from './Modal';
import { useUI, useUser } from '@/lib/state';

export default function HealthProfile() {
  const { contraceptive, otherMedications, setContraceptive, setOtherMedications } = useUser();
  const { setShowProfile } = useUI();

  function updateProfile() {
    setShowProfile(false);
  }

  return (
    <Modal onClose={() => setShowProfile(false)}>
      <div className="userSettings">
        <h2>Your Health Profile</h2>
        <p>
          Providing this information helps PillMatch give you more accurate interaction checks. All data stays on your device.
        </p>

        <form
          onSubmit={e => {
            e.preventDefault();
            updateProfile();
          }}
        >
          <div>
            <p>Contraceptive Method</p>
            <input
              type="text"
              name="contraceptive"
              value={contraceptive}
              onChange={e => setContraceptive(e.target.value)}
              placeholder="E.g., Yasmin, Kyleena IUD, NuvaRing"
            />
          </div>

          <div>
            <p>Other Medications or Conditions</p>
            <textarea
              rows={3}
              name="otherMedications"
              value={otherMedications}
              onChange={e => setOtherMedications(e.target.value)}
              placeholder="List any other medications, supplements, or health conditions."
            />
          </div>

          <button className="button primary">Save Profile</button>
        </form>
      </div>
    </Modal>
  );
}