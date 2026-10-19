# CLAUDE.md

Проект `ValueStore`: контракт-хранилище строки и числа для тестовых сетей Ethereum (режимы `public` и `private`) + TypeScript-клиент и скрипты. Единственный источник правды: `docs/SPEC.md`. Решения, не описанные в ТЗ: `docs/DECISIONS.md`. Ход работ: `docs/PLAN.md`.

## Стек

- Solidity 0.8.37, OpenZeppelin Contracts 5.6 (`Ownable`, `EnumerableSet`)
- Hardhat 3.20 + `@nomicfoundation/hardhat-toolbox-mocha-ethers` (mocha, chai, ethers v6, verify, typechain)
- TypeScript 6 strict, ESM (`"type": "module"`, относительные импорты с `.js`)
- Node 22.10+ для разработки; клиент совместим с Node 18+
- npm (единственный менеджер пакетов)

## Команды

| Что | Команда |
|---|---|
| Установка | `npm install` |
| Компиляция | `npm run build` |
| Все тесты | `npm test` |
| Покрытие | `npm run coverage` (встроенное `hardhat test --coverage`) |
| Линт | `npm run lint` (solhint + `tsc --noEmit`) |
| Локальная нода | `npm run node` |
| Деплой локально | `npm run deploy:local` (нужна запущенная `npm run node`) |
| Деплой Sepolia | `npx hardhat run scripts/deploy.ts --network sepolia` |
| Управление | `npm run <keygen\|status\|get\|set-string\|set-number\|clear-string\|clear-number\|add-editor\|remove-editor> -- [args] [--network sepolia\|hoodi\|localhost] [--account N]` (по умолчанию `sepolia`; `--account` только для localhost) |
| Пример читателя | `npm run example:read -- <rpcUrl> <address>` (+ `VALUESTORE_KEY` для private) |

Если binaries.soliditylang.org недоступен, задать `SOLC_PATH` в `.env` (путь к нативному solc 0.8.37).

## Структура

- `contracts/ValueStore.sol`: контракт
- `test/`: тесты контракта и клиента
- `scripts/`: `deploy.ts` и скрипты управления (`scripts/lib/` общие хелперы)
- `client/`: `ValueStoreReader`, `ValueStoreWriter`, `crypto.ts`, `errors.ts`, `index.ts`
- `examples/read-value.ts`: минимальный читатель
- `deployments/`: `<network>.json` после деплоя (в git только `.gitkeep`)
- `docs/`: `SPEC.md`, `DECISIONS.md`, `PLAN.md`, `SECURITY.md`

## Соглашения

- Только custom errors, без `require` со строками. NatSpec на все внешние функции, события, ошибки.
- Контракт минимальный: ничего сверх ТЗ. Нет `payable`, `receive`, `fallback`, `selfdestruct`, `delegatecall`, прокси.
- TypeScript strict, без `any`. Число в клиенте всегда `bigint`.
- Шифрование только на `node:crypto` (AES-256-GCM), формат `0x01 | iv(12) | ciphertext | tag(16)`, AAD `chainId:addressLowercase:field`.
- Небольшие файлы с одной ответственностью.
- Conventional Commits, коммит на этап или логический блок. Перед коммитом: build, test, lint зелёные.
- Никаких секретов в git: `.env`, файлы ключей в `.gitignore`.

## Не входит в v1

Mainnet и реальные средства; прокси и апгрейды; фронтенд; ограничение чтения на уровне контракта; шифрование внутри сети (zk, TEE); несколько ключей и автоматическая ротация; история значений в контракте (только через события); соответствие стандартам ERC; пуш в удалённый репозиторий (кроме рабочей ветки облачной сессии, см. DECISIONS).
