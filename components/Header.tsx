/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from "react";

export default function Header() {
  return (
    <header className="pm-header">
      <div className="pm-header__inner">
        <h1 className="pm-title">PillMatch</h1>
        <p className="pm-tagline" role="note">
          Vérifie en quelques secondes si tes traitements et ta contraception font bon ménage.
          <span className="pm-tagline__addon"> Infos fiables, conseils clairs.</span>
        </p>
      </div>
    </header>
  );
}
