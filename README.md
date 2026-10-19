# ValueStore

Смарт-контракт для тестовой сети Ethereum, который хранит **два значения: строку и число**. Менять их могут владелец и назначенные им редакторы, читать может кто угодно, бесплатно и без кошелька. В комплекте TypeScript-клиент, скрипт деплоя одной командой и скрипты управления.

Два режима, выбираются один раз при деплое:

- **`public`**: значения хранятся открыто (`string`, `uint256`);
- **`private`**: в контракте лежит только шифротекст (AES-256-GCM), шифрует и расшифровывает клиент, ключ в сеть не попадает.

> ⚠️ **Только для тестовых сетей и обучения.** Контракт не проходил независимый аудит. Mainnet в проекте запрещён на уровне скриптов. Перед использованием с реальными данными нужен аудит.

Содержание: [Быстрый старт](#быстрый-старт) · [Режимы и приватность](#режимы-и-честное-описание-приватности) · [Читающее приложение](#как-подключить-читающее-приложение) · [Редакторы](#как-управлять-редакторами) · [Ключ шифрования](#ключ-шифрования) · [Верификация](#верификация-на-etherscan) · [Команды](#все-команды) · [Разработка](#разработка)

## Быстрый старт

### 0. Что нужно

- Node.js **22.10+** (требование Hardhat 3; сам клиент работает и на Node 18+), npm, git.
- Отдельный **тестовый** кошелёк (например, новый аккаунт в MetaMask). Никогда не используйте кошелёк с реальными средствами.

### 1. Установка

```bash
git clone <url-репозитория> valuestore && cd valuestore
npm install
npm test          # убедиться, что всё работает (117 тестов)
```

### 2. Тестовый ETH для Sepolia

Деплой и запись стоят газ (тестовый, бесплатный). Получите немного Sepolia ETH на адрес тестового кошелька через любой кран:

- Google Cloud Web3 Faucet: <https://cloud.google.com/application/web3/faucet/ethereum/sepolia>
- Alchemy: <https://www.alchemy.com/faucets/ethereum-sepolia>
- PoW-кран (без регистрации, майнинг в браузере): <https://sepolia-faucet.pk910.de>

Для деплоя и десятка записей хватит 0.05 Sepolia ETH. Краны меняют условия; если один не работает, попробуйте другой.

### 3. Настройка `.env`

```bash
cp .env.example .env
```

Заполните в `.env`:

| Переменная | Что это |
|---|---|
| `PRIVATE_KEY` | Приватный ключ тестового кошелька (`0x...`). Нужен для деплоя и записи. |
| `SEPOLIA_RPC_URL` | RPC-адрес Sepolia. Подойдёт публичный (уже в примере) или ваш от Alchemy/Infura. |
| `MODE` | `public` или `private`. **Изменить после деплоя нельзя.** |
| `INITIAL_OWNER` | Необязательно. Адрес владельца; пусто = адрес деплоера. |
| `ETHERSCAN_API_KEY` | Необязательно. Если задан, контракт сразу верифицируется на Etherscan. |
| `VALUESTORE_KEY` | Только для `private`: ключ шифрования, см. `npm run keygen`. |

`.env` в `.gitignore` и никогда не коммитится.

Для режима `private` сначала сгенерируйте ключ и вставьте строку в `.env`:

```bash
npm run keygen
# VALUESTORE_KEY=3f9a...   <- скопировать в .env и сохранить в надёжном месте
```

### 4. Деплой (одна команда)

```bash
npx hardhat run scripts/deploy.ts --network sepolia
# или то же самое: npm run deploy:sepolia
```

Скрипт:
1. проверяет, что сеть в белом списке (Sepolia, Hoodi, локальная). На mainnet и любых других сетях он остановится с ошибкой;
2. деплоит контракт и ждёт `CONFIRMATIONS` подтверждений (по умолчанию 2);
3. сохраняет `deployments/sepolia.json` (адрес, режим, владелец, txHash, блок, время);
4. выводит адрес и ссылку на <https://sepolia.etherscan.io>;
5. если задан `ETHERSCAN_API_KEY`, верифицирует исходный код.

### 5. Запись и чтение

Скрипты берут адрес контракта из `deployments/<сеть>.json`. Сеть по умолчанию `sepolia`.

```bash
npm run set-string -- "Привет, мир"
npm run set-number -- 42
npm run get
# mode:   public
# string: "Привет, мир"
# number: 42
npm run status        # режим, владелец, редакторы, has*, revision
```

### Попробовать локально, без Sepolia

Терминал 1, локальная нода Hardhat (chainId 31337, `127.0.0.1:8545`):

```bash
npm run node
```

Терминал 2:

```bash
npm run deploy:local                                  # режим берётся из MODE в .env
npm run set-string -- "привет" --network localhost
npm run set-number -- 0 --network localhost
npm run get -- --network localhost
npm run add-editor -- 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --network localhost
npm run set-number -- 7 --network localhost --account 1    # пишет редактор
```

Для режима `private` поставьте в `.env` `MODE=private` и `VALUESTORE_KEY=...` (из `npm run keygen`) и задеплойте заново.

На `localhost` скрипты подписывают транзакции dev-аккаунтами ноды: `--account N` выбирает аккаунт (по умолчанию 0, он же деплоер и владелец).

## Режимы и честное описание приватности

**Прочитайте этот раздел до выбора режима.**

- **В блокчейне нет авторизации на чтение.** Любой может вызвать `view`-функцию или прочитать хранилище контракта напрямую, подставив любой адрес.
- Поэтому ограничение «читает только разрешённый кошелёк» **невозможно и в контракте не реализуется**.
- Клиенту для чтения **не нужен кошелёк**. Достаточно RPC-адреса и адреса контракта. Это `eth_call`, без газа и без подписи.
- Кошелёк с правами нужен **только для записи** (транзакции).
- В режиме `private` защита строится на **шифровании**: читать шифротекст может кто угодно, а расшифровать только владелец ключа.
- **Что остаётся видимым даже в `private`:** сам факт значения, длина шифротекста, время и автор каждого изменения, история изменений (все прошлые шифротексты остаются в старых блоках).
- **Потеря ключа означает потерю данных**, восстановления нет.
- **Ротация ключа выполняется вручную:** перешифровать и записать заново.

| | `public` | `private` |
|---|---|---|
| Что в контракте | `string`, `uint256` | шифротекст `bytes` |
| Кто читает значение | любой | любой, у кого есть ключ |
| Кто видит метаданные (есть ли значение, длина, кто и когда менял) | любой | любой |
| Нужен ключ для записи | нет | да, всем, кто пишет |
| Макс. размер | строка 1024 байта | шифротекст 2048 байт (строка до 2019 байт) |

Подробная модель угроз: [`docs/SECURITY.md`](docs/SECURITY.md).

## Как подключить читающее приложение

Приложению нужны только RPC-адрес и адрес контракта (плюс ключ для `private`). Режим определяется автоматически.

```ts
import { ValueStoreReader } from "./client/index.js";

const reader = ValueStoreReader.connect({
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  address: "0xВашКонтракт",
  key: process.env.VALUESTORE_KEY, // только для private
});

const text = await reader.getString();   // string | null (null, если не задано)
const value = await reader.getNumber();  // bigint | null
console.log(await reader.getMode(), text, value, await reader.getRevision());
```

Готовый пример: [`examples/read-value.ts`](examples/read-value.ts).

```bash
npm run example:read -- https://ethereum-sepolia-rpc.publicnode.com 0xВашКонтракт
```

Чтобы использовать клиент в своём проекте, скопируйте папку `client/` (зависимость одна: `ethers` v6).

### API клиента

```ts
// Чтение (кошелёк не нужен)
reader.getMode()      // 'public' | 'private'
reader.hasString()    // boolean        reader.hasNumber()  // boolean
reader.getString()    // string | null  reader.getNumber()  // bigint | null
reader.getRevision()  // bigint, растёт при каждом изменении (удобно для кэша)
reader.getEditors()   // string[]       reader.getOwner()   // string
reader.canEdit(addr)  // boolean

// Запись (нужен подписант с правами)
const writer = ValueStoreWriter.connect({ rpcUrl, address, signer, key });
await writer.setString("...");  // в private шифрует сам
await writer.setNumber(42n);    // любое uint256, включая 0
await writer.clearString();     await writer.clearNumber();
await writer.addEditor("0x...");  await writer.removeEditor("0x...");  // только владелец
```

Ошибки типизированы (`import { ... } from "./client/index.js"`):

| Ошибка | Когда |
|---|---|
| `KeyRequired` | контракт в режиме `private`, а ключ не передан |
| `DecryptionError` | неверный ключ, повреждённый шифротекст, шифротекст от другого контракта/поля/сети |
| `InvalidKeyError` | ключ не 64 hex-символа (32 байта) |
| `InvalidValueError` | пустая или слишком длинная строка, число вне `uint256`, неверный адрес (до отправки транзакции) |
| `ContractRevertError` | контракт отклонил транзакцию; `errorName`: `NotAuthorized`, `AlreadyEditor`, `NotEditor`, `TooManyEditors`, `ZeroAddress`... |

## Как управлять редакторами

Редактор может менять и сбрасывать значения. Управлять редакторами и передавать владение может только владелец. Владелец всегда имеет права редактора, добавлять его не нужно. Максимум 32 редактора.

```bash
npm run add-editor -- 0xАдресРедактора
npm run remove-editor -- 0xАдресРедактора
npm run status                      # список редакторов
```

Редактор работает теми же скриптами со своим `PRIVATE_KEY` в своём `.env` (и с тем же `VALUESTORE_KEY` для `private`). Снятый редактор сразу теряет право записи (`NotAuthorized`).

Передача владения: функция `transferOwnership(newOwner)` из OpenZeppelin `Ownable` (через Etherscan → Write Contract после верификации). Старый владелец сразу теряет права. Отказаться от владения (`renounceOwnership`) нельзя: иначе редакторами никто не смог бы управлять.

## Ключ шифрования

Только для режима `private`.

- **Генерация:** `npm run keygen` выводит `VALUESTORE_KEY=<64 hex>`. Либо `npm run keygen -- --out ~/valuestore.key` создаёт файл с правами 0600 **вне репозитория** (тогда в `.env` укажите полный путь без `~`: `VALUESTORE_KEY_FILE=/home/you/valuestore.key`).
- **Хранение:** только `.env` или файл вне репозитория. Ключ никогда не отправляется в сеть и не должен попасть в git.
- **Кому нужен:** всем, кто читает **и** пишет. Передавайте его вне блокчейна (менеджер паролей, зашифрованный мессенджер). Это ответственность владельца.
- **Резервная копия обязательна.** **Потеря ключа = потеря данных.** Восстановления нет: в контракте только шифротекст, без ключа он бесполезен.
- **Ротация (ручная):** прочитать значения старым ключом (`npm run get`), сгенерировать новый ключ, заменить `VALUESTORE_KEY`, записать значения заново (`set-string`, `set-number`), раздать новый ключ. Старые шифротексты остаются в истории блокчейна и расшифровываются старым ключом, поэтому при утечке старого ключа прошлые значения раскрыты.
- **Формат** (для совместимости с другими языками): `0x01 | iv (12 байт) | ciphertext | authTag (16 байт)`, AES-256-GCM, AAD = UTF-8 строка `chainId:адресКонтрактаВНижнемРегистре:field`, где `field` это `string` или `number`. Число шифруется как десятичная строка.

## Верификация на Etherscan

Верификация публикует исходный код, и на Etherscan появляются вкладки Read/Write Contract.

1. Получите бесплатный API-ключ: <https://etherscan.io/myapikey> (ключ Etherscan API v2 работает и для Sepolia).
2. Пропишите `ETHERSCAN_API_KEY` в `.env`.
3. Либо задеплойте заново: верификация запустится автоматически. Либо верифицируйте уже задеплоенный контракт (команду с аргументами печатает скрипт деплоя):

```bash
npx hardhat verify --network sepolia <адрес> <владелец> <режим: 0 = public, 1 = private>
```

Если Etherscan ещё не увидел контракт («does not have bytecode»), подождите минуту и повторите.

## Все команды

| Команда | Что делает |
|---|---|
| `npm run build` | Компиляция контракта |
| `npm test` | Все тесты (контракт, деплой, шифрование, клиент, e2e) |
| `npm run coverage` | Покрытие контракта + проверка порога 95% |
| `npm run lint` | solhint + проверка типов TypeScript |
| `npm run slither` | Статический анализ (нужен установленный Slither) |
| `npm run node` | Локальная нода Hardhat на `127.0.0.1:8545` |
| `npm run deploy:local` / `npm run deploy:sepolia` | Деплой |
| `npm run keygen` | Новый ключ AES-256 |
| `npm run status` | Режим, владелец, редакторы, `has*`, revision |
| `npm run get` | Прочитать значения |
| `npm run set-string -- "<текст>"` | Записать строку |
| `npm run set-number -- <число>` | Записать число |
| `npm run clear-string` / `npm run clear-number` | Сбросить значение |
| `npm run add-editor -- <адрес>` / `npm run remove-editor -- <адрес>` | Управление редакторами |
| `npm run example:read -- <rpcUrl> <адрес>` | Пример читающего приложения |

Скрипты управления принимают `--network sepolia|hoodi|localhost` (по умолчанию `sepolia`) и на `localhost` `--account N`.

## Разработка

- Стек: Solidity 0.8.37, Hardhat 3, OpenZeppelin Contracts 5, ethers 6, TypeScript strict. Версии и решения: [`docs/DECISIONS.md`](docs/DECISIONS.md).
- ТЗ: [`docs/SPEC.md`](docs/SPEC.md), план: [`docs/PLAN.md`](docs/PLAN.md), безопасность: [`docs/SECURITY.md`](docs/SECURITY.md), заметки для ассистента: [`CLAUDE.md`](CLAUDE.md).
- Если среда не может скачать компилятор с binaries.soliditylang.org, укажите путь к нативному solc 0.8.37 в `SOLC_PATH` (`.env`).

```
contracts/ValueStore.sol   контракт
client/                    ValueStoreReader, ValueStoreWriter, crypto.ts, errors.ts, abi.ts, index.ts
scripts/                   deploy.ts, скрипты управления, scripts/lib/ общие модули
examples/read-value.ts     минимальное читающее приложение
test/                      contract/, client/, scripts/, e2e/
deployments/               <сеть>.json после деплоя (в git только .gitkeep)
docs/                      SPEC, DECISIONS, PLAN, SECURITY
```

## Лицензия

MIT, см. [LICENSE](LICENSE).
