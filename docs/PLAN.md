# План разработки

По разделу 15 ТЗ. Отметка `[x]` ставится, когда этап закончен: компиляция, тесты и линт зелёные, есть коммит.

## Этап 1. Каркас проекта
- [x] `docs/SPEC.md` (ТЗ дословно), `docs/DECISIONS.md`, `docs/PLAN.md`
- [x] Hardhat 3 + TypeScript strict, mocha-ethers toolbox, OpenZeppelin v5, ethers v6
- [x] `hardhat.config.ts`: solc 0.8.37, сети localhost / sepolia / hoodi, verify
- [x] `.gitignore`, `.env.example`, `.solhint.json`, `deployments/.gitkeep`
- [x] `CLAUDE.md`, npm-скрипты

## Этап 2. Контракт и тесты контракта
- [x] `contracts/ValueStore.sol` (разделы 3, 5, 6, 7)
- [x] Тесты всех сценариев раздела 12 «Контракт» (49 тестов)
- [x] Покрытие: 100% строк и выражений (`npm run coverage`)

## Этап 3. Деплой
- [x] `scripts/deploy.ts`: белый список chainId, подтверждения, `deployments/<network>.json`
- [x] Опциональная верификация на Etherscan
- [x] Тест логики деплоя (белый список, запись файла)

## Этап 4. Клиент
- [ ] `client/crypto.ts`, `client/errors.ts`
- [ ] `ValueStoreReader`, `ValueStoreWriter`, `client/index.ts`
- [ ] Тесты шифрования и клиента, сквозной тест на Hardhat network

## Этап 5. Скрипты управления
- [ ] `keygen`, `get`, `set-string`, `set-number`, `clear-string`, `clear-number`, `add-editor`, `remove-editor`, `status`
- [ ] `examples/read-value.ts`
- [ ] Проверка локального сценария на `hardhat node`

## Этап 6. Безопасность и документация
- [ ] solhint, Slither (или пометка о невозможности)
- [ ] `docs/SECURITY.md` (модель угроз)
- [ ] `README.md`
- [ ] Финальная проверка
