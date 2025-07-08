/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import Header from './components/Header';
import PillMatchChat from './components/demo/keynote-companion/KeynoteCompanion';

/**
 * Main application component for PillMatch.
 */
function App() {
  return (
    <div className="App">
        <Header />
        <main className="pillmatch-main">
          <PillMatchChat />
        </main>
    </div>
  );
}

export default App;