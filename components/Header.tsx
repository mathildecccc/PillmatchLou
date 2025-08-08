/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export default function Header() {
  return (
    <header>
      <div className="header-content" style={{ textAlign: "center", padding: "1rem 0" }}>
        <h1 style={{ color: "#ec6a88", fontWeight: 600, marginBottom: "0.3rem" }}>
          PillMatch
        </h1>
        <p
          style={{
            fontSize: "0.95rem",
            color: "rgba(17, 24, 39, 0.75)",
            maxWidth: "500px",
            margin: "0 auto",
            lineHeight: 1.5,
          }}
        >
          Vérifie en quelques secondes si tes traitements et ta contraception font bon ménage
        </p>
      </div>
    </header>
  );
}
