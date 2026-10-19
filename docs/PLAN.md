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
- [x] `client/crypto.ts`, `client/errors.ts`, `client/abi.ts`
- [x] `ValueStoreReader`, `ValueStoreWriter`, `client/index.ts`
- [x] Тесты шифрования и клиента, сквозной тест через JSON-RPC сервер Hardhat (117 тестов всего)

## Этап 5. Скрипты управления
- [x] `keygen`, `get`, `set-string`, `set-number`, `clear-string`, `clear-number`, `add-editor`, `remove-editor`, `status`
- [x] `examples/read-value.ts`
- [x] Проверка локального сценария на `hardhat node`: оба режима, запись, чтение, add/remove editor, ошибки (`NotAuthorized`, `KeyRequired`, `DecryptionError`)

## Этап 6. Безопасность и документация
- [x] solhint (0 замечаний), Slither 0.11.6 (0 находок по `ValueStore.sol`)
- [x] `docs/SECURITY.md` (модель угроз)
- [x] `README.md`
- [x] Финальная проверка: build, 117 тестов, покрытие 100%, lint, локальный сценарий по README
- [ ] Деплой на Sepolia по инструкции: **выполняет владелец**. Из среды разработки RPC Sepolia недоступен (сетевая политика), реального тестового кошелька с ETH нет. Проверено: без `.env` скрипт останавливается с понятной ошибкой, белый список сетей покрыт тестами.
