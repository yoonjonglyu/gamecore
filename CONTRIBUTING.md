# Contributing to GameCore

Thank you for your interest in contributing to **GameCore** (`ryuis-gamecore`)!  
We welcome bug reports, documentation improvements, feature suggestions, and code contributions.

---

## 💎 Guiding Principles

Before submitting a Pull Request, please ensure your contribution adheres to our core design philosophies:

1. **Zero External Dependencies**: GameCore must remain 100% dependency-free in production runtime (no third-party npm packages in dependencies).
2. **Platform Agnostic & Headless**: No references to `window`, `document`, `fs`, `http`, or Node/Browser-only globals. The engine must run identically on Web, Node.js, Bun, React Native, Wasm, or embedded V8 (Puerts in Unity/Unreal).
3. **Deterministic Simulation**: All random choices must use `SeededRandom` (PCG32). Never use `Math.random()`.
4. **ECS Discipline**: Components hold pure data; Systems contain pure logic.

---

## 🛠️ Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/<your-username>/gamecore.git
   cd gamecore
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Run Typecheck & Tests**
   ```bash
   pnpm run typecheck
   pnpm test
   ```

4. **Build Distribution Bundle**
   ```bash
   pnpm run build
   ```

---

## 📝 Pull Request Guidelines

- Branch naming: `feat/<feature-name>`, `fix/<bug-name>`, `docs/<topic>`
- Always write or update tests in `tests/` for any new logic or bug fixes.
- Ensure 100% test pass rate with zero type errors before opening a PR.
- Keep commits clear, descriptive, and atomic.

---

## 📜 License

By contributing to GameCore, you agree that your contributions will be licensed under the **Apache License 2.0**.
