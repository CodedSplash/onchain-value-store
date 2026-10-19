# ТЗ v1.0: `ValueStore`, контракт-хранилище значения для тестовой сети Ethereum

## 1. Цель и принципы

Смарт-контракт, который хранит два независимых значения (строку и число) и отдаёт их по запросу. Менять значения могут владелец и назначенные им редакторы. Контракт работает в двух режимах: `public` (значения хранятся открыто) и `private` (хранится шифротекст, шифрование делается вне сети). К контракту прилагается клиентская библиотека и скрипты, чтобы приложение могло читать значение, а владелец быстро деплоить и управлять.

- Только тестовые сети. Mainnet в проекте запрещён.
- Минимум кода в контракте, максимум готовых проверенных компонентов (OpenZeppelin).
- Режим выбирается один раз при деплое и потом не меняется.
- Чтение бесплатное и без авторизации. Запись только через кошелёк с правами.
- Проект должен быть полностью готов к использованию: клонировал, настроил `.env`, задеплоил одной командой.
- Лицензия MIT.

## 2. Стек и поставка

- Solidity: последняя стабильная версия 0.8.x. Точную версию определить при сборке по docs.soliditylang.org и зафиксировать в конфиге.
- Hardhat: актуальная стабильная версия, TypeScript. Если актуален Hardhat 3, использовать его рекомендованный набор плагинов. Выбор записать в `docs/DECISIONS.md`.
- OpenZeppelin Contracts v5: `Ownable` и `EnumerableSet`.
- Клиент: TypeScript, Node 18+, ethers v6 (или viem, если этого требует Hardhat-набор).
- Тесты: Hardhat test (mocha/chai) плюс `hardhat coverage`.
- Сеть по умолчанию: Sepolia (chainId 11155111). Локально: Hardhat network (31337).
- Менеджер пакетов: npm (или pnpm, на выбор исполнителя, но один).
- Git: локальный репозиторий с историей коммитов. Пуш на GitHub делает владелец сам.

## 3. Режимы работы

- **Public**: значения хранятся как есть (`string` и `uint256`). Любой читает их напрямую из контракта.
- **Private**: контракт хранит только шифротекст (`bytes`). Шифрует и расшифровывает клиентская библиотека, ключ в сеть не попадает.

Режим задаётся в конструкторе и хранится как `immutable`. Функции чужого режима выполняются с ошибкой `WrongMode`.

## 4. Честное описание приватности (обязательно в README)

- В блокчейне нет авторизации на чтение. Любой может вызвать `view`-функцию или прочитать хранилище напрямую, подставив любой адрес.
- Поэтому ограничение «читает только разрешённый кошелёк» невозможно и в контракте не реализуется.
- Клиенту для чтения не нужен кошелёк. Достаточно RPC-адреса и адреса контракта. Это `eth_call`, без газа и без подписи.
- Кошелёк с правами нужен только для записи (транзакции).
- В режиме `private` защита строится на шифровании: читать шифротекст может кто угодно, а расшифровать только владелец ключа.
- Что остаётся видимым даже в `private`: сам факт значения, длина шифротекста, время и автор каждого изменения, история изменений.
- Потеря ключа означает потерю данных, восстановления нет.
- Ротация ключа выполняется вручную: перешифровать и записать заново.

## 5. Контракт: состояние

- `owner`: из `Ownable`, задаётся при деплое.
- `mode`: `Mode.Public` или `Mode.Private`, `immutable`.
- Публичные значения: `string _string`, `uint256 _number`.
- Шифрованные значения: `bytes _encString`, `bytes _encNumber`.
- Флаги `_hasString` и `_hasNumber`. Они нужны, потому что `0` и пустая строка по умолчанию не отличаются от «не задано».
- `uint256 revision`: счётчик, растёт при каждом изменении значения. Клиент использует его для кэша.
- `EnumerableSet.AddressSet _editors`: список редакторов.

Константы:
- `MAX_STRING_BYTES = 1024`
- `MAX_CIPHERTEXT_BYTES = 2048`
- `MAX_EDITORS = 32`

## 6. Контракт: интерфейс

```solidity
enum Mode { Public, Private }

constructor(address initialOwner, Mode mode_);

// Чтение (всем, бесплатно)
function mode() external view returns (Mode);
function hasString() external view returns (bool);
function hasNumber() external view returns (bool);
function getString() external view returns (string memory);          // только Public
function getNumber() external view returns (uint256);                // только Public
function getEncryptedString() external view returns (bytes memory);  // только Private
function getEncryptedNumber() external view returns (bytes memory);  // только Private
function revision() external view returns (uint256);
function canEdit(address account) external view returns (bool);      // owner или редактор
function getEditors() external view returns (address[] memory);

// Запись (owner или редактор)
function setString(string calldata value) external;                  // только Public
function setNumber(uint256 value) external;                          // только Public
function setEncryptedString(bytes calldata data) external;           // только Private
function setEncryptedNumber(bytes calldata data) external;           // только Private
function clearString() external;
function clearNumber() external;

// Управление (только owner)
function addEditor(address account) external;
function removeEditor(address account) external;
// transferOwnership из Ownable
```

Правила:
- Геттеры не падают, если значение не задано: возвращают пустое значение. Задано ли оно, проверяется через `hasString()` и `hasNumber()`.
- Геттер чужого режима падает с `WrongMode`.
- Пустая строка и пустой шифротекст в `set*` запрещены, для сброса есть `clear*`.
- Строка не длиннее 1024 байт, шифротекст не длиннее 2048 байт.
- `setNumber` принимает любое `uint256`, включая 0.
- `renounceOwnership` отключён (всегда `revert RenounceDisabled`), иначе редакторов уже никто не сможет менять.
- Владелец неявно имеет права редактора. В список редакторов его добавлять не нужно.
- Нулевой адрес нельзя ни в редакторы, ни в новые владельцы.
- Редактор не может добавлять и снимать редакторов, не может передавать владение.
- Нет `payable`-функций, `receive` и `fallback` отсутствуют, контракт ETH не принимает.

## 7. Ошибки и события

Custom errors:
- `NotAuthorized(address caller)`
- `WrongMode()`
- `ValueTooLong(uint256 max, uint256 actual)`
- `EmptyValue()`
- `ZeroAddress()`
- `AlreadyEditor(address account)`
- `NotEditor(address account)`
- `TooManyEditors()`
- `RenounceDisabled()`

События:
- `StringUpdated(address indexed by, uint256 revision)`
- `NumberUpdated(address indexed by, uint256 revision)`
- `StringCleared(address indexed by, uint256 revision)`
- `NumberCleared(address indexed by, uint256 revision)`
- `EditorAdded(address indexed editor)`
- `EditorRemoved(address indexed editor)`

## 8. Шифрование для режима private

Реализуется в клиентской библиотеке (`client/crypto.ts`) на `node:crypto`, без внешних зависимостей.

- Алгоритм: AES-256-GCM.
- Ключ: 32 случайных байта. Генерируется командой `keygen`, хранится в `.env` (`VALUESTORE_KEY`, hex) или в файле вне репозитория. В сеть и в git не попадает никогда.
- Формат шифротекста, который кладётся в контракт: `version (1 байт, 0x01) | iv (12 байт) | ciphertext | authTag (16 байт)`.
- IV генерируется случайно при каждом шифровании.
- AAD (привязка шифротекста к месту): UTF-8 строка `chainId:contractAddressLowercase:field`, где `field` это `string` или `number`. Благодаря этому нельзя подменить строку числом или перенести шифротекст в другой контракт.
- Что шифруется: строка как UTF-8, число как десятичная строка `uint256` в UTF-8.
- Расшифровка при неверном ключе, повреждении или неверном AAD даёт типизированную ошибку `DecryptionError`.
- Все, кто пишет в режиме `private` (владелец и редакторы), должны иметь ключ. Передача ключа выполняется вне сети, это зона ответственности владельца.

## 9. Клиентская библиотека

Папка `client/`, чистый TypeScript, используется и из скриптов, и из внешнего приложения.

```ts
// Чтение: кошелёк не нужен
const reader = ValueStoreReader.connect({
  rpcUrl, address, key?  // key нужен только для режима private
});
await reader.getMode();               // 'public' | 'private'
await reader.hasString();             // boolean
await reader.hasNumber();             // boolean
await reader.getString();             // string | null (null, если не задано)
await reader.getNumber();             // bigint | null
await reader.getRevision();           // bigint
await reader.getEditors();            // string[]

// Запись: нужен подписант
const writer = ValueStoreWriter.connect({ rpcUrl, address, signer, key? });
await writer.setString('...');        // сам шифрует в режиме private
await writer.setNumber(42n);
await writer.clearString();
await writer.addEditor('0x...');
await writer.removeEditor('0x...');
```

- Режим определяется автоматически чтением `mode()`. Вызывающему не нужно знать, public это или private.
- В режиме `private` без ключа чтение даёт ошибку `KeyRequired`.
- Число всегда `bigint`.
- Читателю нужен только `rpcUrl` и `address`. Это то, что нужно «приложению, которое получает значение».

## 10. Скрипты и деплой

Деплой одной командой:
`npx hardhat run scripts/deploy.ts --network sepolia`

Параметры берутся из `.env`: `MODE=public|private`, `INITIAL_OWNER` (если не задан, то адрес деплоера).

Скрипт деплоя:
- Проверяет, что chainId входит в белый список (Sepolia, Hardhat local, по желанию Hoodi). Иначе останавливается с понятной ошибкой. Mainnet запрещён.
- Ждёт заданное число подтверждений.
- Сохраняет `deployments/<network>.json` (адрес, режим, владелец, txHash, блок, время).
- Опционально запускает верификацию на Etherscan, если задан `ETHERSCAN_API_KEY`.
- Выводит адрес контракта и ссылку на Sepolia Etherscan.

Скрипты управления (`scripts/`), каждый работает с адресом из `deployments/`:
- `keygen`: генерация ключа AES-256 (только для режима private).
- `get`: прочитать значения.
- `set-string` и `set-number`: записать значение.
- `clear-string` и `clear-number`.
- `add-editor` и `remove-editor`.
- `status`: режим, владелец, редакторы, `has*`, revision.

`.env.example` с комментариями: `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, `MODE`, `INITIAL_OWNER`, `VALUESTORE_KEY`. Файл `.env` в `.gitignore`.

## 11. Безопасность

- Приватный ключ деплоера только в `.env`, отдельный тестовый кошелёк без реальных средств.
- Никаких ключей, `.env` и файлов с ключами шифрования в git.
- Отсутствуют `selfdestruct`, `delegatecall`, прокси и апгрейды.
- Все внешние функции с проверкой прав через модификаторы.
- Линт Solidity (solhint) и статический анализ Slither, если его удаётся запустить в окружении. Результаты записать в `docs/SECURITY.md`.
- Предупреждение в README: контракт для тестовой сети и обучения, перед использованием с реальными данными нужен независимый аудит.

## 12. Тесты

Контракт:
- Деплой в обоих режимах: `mode`, `owner`, начальные `has*` равны false.
- Владелец меняет значения: успех в обоих режимах.
- Редактор меняет значения: успех.
- Посторонний меняет значения: `NotAuthorized`.
- Редактор добавляет или снимает редакторов: `NotAuthorized`.
- Снятый редактор больше не может писать.
- `setString` и `setNumber` в режиме Private, `setEncrypted*` в режиме Public: `WrongMode`.
- Геттеры чужого режима: `WrongMode`.
- Пустая строка и пустой шифротекст: `EmptyValue`.
- Строка 1024 байта проходит, 1025 падает. Шифротекст 2048 проходит, 2049 падает.
- `setNumber(0)` работает, `hasNumber()` после него true.
- `clear*` сбрасывает флаг и значение.
- `revision` растёт на каждое изменение и сброс.
- Добавление дубля, снятие отсутствующего, нулевой адрес, превышение `MAX_EDITORS`.
- `renounceOwnership` падает, `transferOwnership` работает, новый владелец получает права, старый теряет.
- Отправка ETH на контракт падает.
- Все события эмитятся с правильными аргументами.
- Покрытие контракта не ниже 95% по строкам и веткам.

Клиент и шифрование:
- Round-trip: зашифровал, записал, прочитал, расшифровал. Строка (в том числе юникод и эмодзи) и число (включая 0 и `2^256 - 1`).
- Неверный ключ, повреждённый шифротекст, подменённый AAD (другое поле, другой адрес): `DecryptionError`.
- Разные IV при повторном шифровании одного значения.
- Автоопределение режима, `KeyRequired` без ключа в private.
- Сквозной тест на локальной сети Hardhat: деплой, запись, чтение клиентом.

## 13. Структура репозитория

- `contracts/ValueStore.sol`
- `test/`: тесты контракта и клиента
- `scripts/`: `deploy.ts` и скрипты управления
- `client/`: `ValueStoreReader`, `ValueStoreWriter`, `crypto.ts`, `errors.ts`, `index.ts`
- `examples/read-value.ts`: минимальное приложение, которое читает значение
- `deployments/` (в git только `.gitkeep`)
- `docs/`: `SPEC.md`, `DECISIONS.md`, `PLAN.md`, `SECURITY.md`
- `hardhat.config.ts`, `.env.example`, `.gitignore`, `CLAUDE.md`
- `LICENSE` (MIT), `README.md`

## 14. README

- Что это и для чего.
- Быстрый старт: установка, получение тестового ETH для Sepolia (краны), заполнение `.env`, деплой, чтение.
- Раздел про режимы и честное описание приватности (раздел 4 этого ТЗ).
- Как подключить читающее приложение: пример на 10 строк.
- Как управлять редакторами.
- Как работать с ключом шифрования и что будет при его потере.
- Как верифицировать контракт на Etherscan.

## 15. План разработки

1. Каркас проекта: Hardhat, TypeScript, зависимости, `.gitignore`, `.env.example`, `CLAUDE.md`.
2. Контракт `ValueStore` + тесты контракта.
3. Скрипт деплоя с проверкой chainId, сохранением в `deployments/`, верификацией.
4. Клиент: `crypto.ts`, `Reader`, `Writer`, тесты, сквозной тест.
5. Скрипты управления и пример `examples/read-value.ts`.
6. Безопасность (solhint, Slither), README, финальная проверка деплоя на Sepolia по инструкции.

## 16. Не входит в v1

Mainnet и любые реальные средства, прокси и апгрейды, интерфейс на фронтенде, ограничение чтения на уровне контракта, шифрование внутри сети (zk, TEE), несколько ключей и автоматическая ротация, история значений в самом контракте (история доступна через события), соответствие стандартам ERC.
