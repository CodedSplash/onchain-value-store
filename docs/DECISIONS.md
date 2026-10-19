# Решения (DECISIONS)

Здесь фиксируются выбранные версии и решения там, где ТЗ (`docs/SPEC.md`) допускает варианты или не содержит деталей.

## Версии (проверено 2026-10-19)

| Компонент | Версия | Как проверено |
|---|---|---|
| Solidity | **0.8.37** | Последний релиз на github.com/ethereum/solidity/releases (v0.8.38 отсутствует), совпадает с npm `solc@latest`. Сайт docs.soliditylang.org / binaries.soliditylang.org из окружения разработки недоступен (сетевая политика), поэтому версия сверена по GitHub-релизам. |
| Hardhat | **3.20.0** | `npm view hardhat dist-tags`: `latest = 3.20.0` (Hardhat 2 ушёл в тег `hh2`). |
| Набор плагинов | **@nomicfoundation/hardhat-toolbox-mocha-ethers 4.0.0** | Официальный шаблон Hardhat 3 «mocha-ethers» (`node_modules/hardhat/templates/02-mocha-ethers`). |
| OpenZeppelin Contracts | **5.6.1** | `npm view @openzeppelin/contracts version`. |
| ethers | **6.17.0** | `npm view ethers version`. Выбран ethers, а не viem: ТЗ требует mocha/chai, а официальный mocha-набор Hardhat 3 построен на ethers. |
| TypeScript | **~6.0.3** | Версия из официального шаблона Hardhat 3. TypeScript 7 (нативный порт) уже вышел, но шаблон Hardhat на нём не проверен. |
| solhint | 6.2.5 | npm latest. |
| tsx | 4.23.15 | Уже зависимость Hardhat 3; используется для запуска скриптов управления. |

## Решения

1. **Hardhat 3 и покрытие.** Плагин `solidity-coverage` с Hardhat 3 не работает. В Hardhat 3 покрытие встроено: `hardhat test --coverage` (npm-скрипт `coverage`). Это и есть «`hardhat coverage`» из ТЗ.
2. **Node.js.** Hardhat 3 требует Node 22.10+, поэтому для разработки (компиляция, тесты, деплой) нужен Node 22+. Сам клиент (`client/`) использует только `ethers` и `node:crypto` и совместим с Node 18+.
3. **ESM.** Проект `"type": "module"` (требование Hardhat 3). Относительные импорты в TypeScript пишутся с расширением `.js`.
4. **`.env` без dotenv.** `.env` читается встроенным `process.loadEnvFile()` (Node 20.12+), без лишней зависимости. Hardhat 3 `configVariable(...)` берёт значения из `process.env` лениво, только когда сеть реально используется, поэтому тесты не требуют `.env`.
5. **Локальный компилятор `SOLC_PATH`.** В окружении разработки домен binaries.soliditylang.org заблокирован, поэтому Hardhat не может скачать solc. Добавлена опциональная переменная `SOLC_PATH` (путь к нативному solc 0.8.37, скачанному с GitHub-релиза). Если она пуста, Hardhat скачивает компилятор как обычно.
6. **Одинаковые настройки компилятора для профилей `default` и `production`.** `hardhat-verify` по умолчанию собирает профилем `production`, а `run` профилем `default`. Одинаковые настройки гарантируют совпадение байткода при верификации.
7. **evmVersion = `prague`.** Явно фиксируем EVM-версию, поддерживаемую Sepolia, Hoodi и локальной сетью, чтобы байткод не зависел от дефолта компилятора. Новые опкоды контракту не нужны. Оптимизатор включён, `runs = 200`.
8. **Белый список сетей деплоя:** Sepolia (11155111), Hoodi (560048), Hardhat local (31337). Всё остальное, включая mainnet (1), отклоняется.
9. **Скрипты управления запускаются через `tsx`, а не `hardhat run`.** `hardhat run` в Hardhat 3 не принимает позиционные аргументы, а скриптам нужны значения (`set-string "..."`). Скрипты используют саму клиентскую библиотеку (`client/`), сеть задаётся флагом `--network <name>` (по умолчанию `sepolia`), адрес контракта берётся из `deployments/<network>.json`.
10. **Пуш.** ТЗ запрещает пуш в удалённый репозиторий. Работа ведётся в облачной сессии, контейнер которой временный, поэтому итоговые коммиты пушатся только в рабочую ветку `claude/valuestore-contract-client-9n3n59` (не в `main`, без PR), чтобы не потерять результат. Репозиторий уже был инициализирован (`git init` не нужен).
