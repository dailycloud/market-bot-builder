# Инструкция по content.json

Файл `database/content.json` управляет меню, разделами и кнопками.
Бот читает его при каждом нажатии, поэтому изменения видны без перезапуска.

## Верхний уровень

- `menu_title`: заголовок главного меню.
- `menu_image`: путь к картинке для главного меню (от корня проекта).
- `menu_caption`: подпись под картинкой (если не задано, используется `menu_title`).
- `history_template`: шаблон вывода истории.
- `purchase_template`: шаблон вывода после покупки.
- `purchase_image`: картинка по умолчанию для экрана после покупки.
- `admin_history_template`: шаблон истории сообщений админов (если не задан — используется дефолтный).
- `out_of_stock_text`: текст для окна "нет в наличии" (если не задан — "Нет в наличии").
- `labels`: подписи для навигации и цены.
  - `back`: кнопка "назад".
  - `home`: кнопка "в меню".
  - `purchase`: текст кнопки "приобрести".
  - `history_next`: текст кнопки "след. заказ".
  - `history_prev`: текст кнопки "пред. заказ".
- `history_row`: номер ряда для кнопок истории.
- `price`: подпись для цены.
- `back_row`: номер ряда для кнопки "назад".
- `home_row`: номер ряда для кнопки "в меню".
- `back_order`: сортировка для кнопки "назад".
- `home_order`: сортировка для кнопки "в меню".
- `back_style`, `home_style`, `history_prev_style`, `history_next_style`: стиль кнопок навигации (`primary`, `success`, `danger`).
- `back_color`, `home_color`, `history_prev_color`, `history_next_color`: цвет кнопок (только превью в билдере).
- `back_icon_custom_emoji_id`, `home_icon_custom_emoji_id`, `history_prev_icon_custom_emoji_id`, `history_next_icon_custom_emoji_id`: кастомные emoji на кнопках (нужен Telegram Premium у владельца бота).
- `back_icon_custom_emoji_position`, `home_icon_custom_emoji_position`, `history_prev_icon_custom_emoji_position`, `history_next_icon_custom_emoji_position`: позиция премиум-иконки (`left`/`right`, влияет только на превью).
- `sections`: список разделов.

## Раздел (sections[])

Обязательные поля:
- `id`: уникальный идентификатор.
- `title`: текст кнопки раздела.

Важно: `id` раздела должен быть уникальным среди всех разделов, включая вложенные.
Не используйте символы `:` и `/` в `id` групп и разделов — они используются для навигации.

Необязательные поля:
- `order`: сортировка (меньше = выше).
- `style`: стиль кнопки (`primary`, `success`, `danger`).
- `color`: цвет кнопки (только превью в билдере).
- `icon_custom_emoji_id`: кастомный emoji на кнопке (нужен Telegram Premium у владельца бота).
- `icon_custom_emoji_position`: позиция премиум-иконки (`left`/`right`, влияет только на превью).
- `sections`: список подразделов (вложенные разделы).
- `text`: обычный текст для вывода.
- `file`: путь к текстовому файлу (от корня проекта).
- `template`: шаблон с подстановками данных пользователя.
- `image`: картинка раздела (от корня проекта).
- `image_caption`: подпись под картинкой (если не задано, используется текст раздела).
- `history`: если `true`, раздел показывает историю покупок.
- `admin_history`: если `true`, раздел показывает историю сообщений админов.
- `admin_only`: если `true`, раздел виден только админам.

Если раздел вложенный, бот автоматически добавит кнопку "назад" на родительский раздел.
Подразделы используют те же поля, что и обычные разделы.
- `empty_text`: текст, когда история пуста.
  - если у товара есть `image`, она показывается в истории; иначе используется `sections[].image` (например, blank.png).
- `groups`: список групп (для раздела "Лог").
- `buttons`: список действий (например, сохранить профиль).

### Подстановки в template

Доступные плейсхолдеры:
- `{id}`, `{username}`, `{first_name}`, `{last_name}`, `{language_code}`

## Группа (sections[].groups[])

- `id`, `title`, `order`, `description`, `style` (цвет кнопки: `primary`, `success`, `danger`), `color` (превью), `icon_custom_emoji_id` (Premium emoji), `icon_custom_emoji_position` (позиция иконки, только превью).
- `items`: список карточек.
- `groups`: список вложенных групп (подгрупп).

Подгруппы используют те же поля, что и обычные группы.

## Карточка (sections[].groups[].items[])

- `id`: уникальный идентификатор.
- `title`: название кнопки.
- `price`: цена (строка или число).
- `description`: описание.
- `image`: путь к картинке (от корня проекта).
- `purchase`: настройки кнопки покупки.
- `order`: сортировка.
- `style`: стиль кнопки (`primary`, `success`, `danger`).
- `color`: цвет кнопки (только превью в билдере).
- `icon_custom_emoji_id`: кастомный emoji на кнопке (нужен Telegram Premium у владельца бота).
- `icon_custom_emoji_position`: позиция премиум-иконки (`left`/`right`, влияет только на превью).

Если указан `image`, то картинка отправляется вместе с сообщением.

### purchase (items[].purchase)

- `title`: текст кнопки.
- `order`: сортировка.
- `row`: ряд кнопки.
- `style`: стиль кнопки (`primary`, `success`, `danger`).
- `color`: цвет кнопки (только превью в билдере).
- `icon_custom_emoji_id`: кастомный emoji на кнопке (нужен Telegram Premium у владельца бота).
- `icon_custom_emoji_position`: позиция премиум-иконки (`left`/`right`, влияет только на превью).
- `message`: текст, который будет показан после покупки (если не задан, используется `purchase_template`).
- `image`: картинка для экрана после покупки (если не задано, используется `purchase_image`).

## Кнопки действий (sections[].buttons[])

- `id`: уникальный идентификатор.
- `title`: текст кнопки.
- `action`: действие.
- `order`: сортировка.
- `style`: стиль кнопки (`primary`, `success`, `danger`).
- `color`: цвет кнопки (только превью в билдере).
- `icon_custom_emoji_id`: кастомный emoji на кнопке (нужен Telegram Premium у владельца бота).
- `icon_custom_emoji_position`: позиция премиум-иконки (`left`/`right`, влияет только на превью).

Поддерживаемые `action`:
- `save_user`: сохранить пользователя в `database/users.json`.
- `admin_broadcast`: включить режим рассылки всем.
- `admin_send_to`: включить режим отправки по ID.
- `admin_history`: открыть историю сообщений админов.

История админских сообщений хранится в `database/admin_messages.json`, медиа — в `database/admin_media/`.

## Форматирование текста

Форматирование работает для `menu_title`, `text`, `template` и файлов в `file`.
Отдельный гайд: `database/formatting_guide.md`.

Поддерживаемые маркеры:
- `*bold*` → **жирный**.
- `_cursive_` → *курсив*.
- `:quote: Текст` → цитата (блок).
- `__underline__` → подчёркнутый.
- `*[spoiler]*` → спойлер.
- `-зачеркнутый-` → зачёркнутый.

## Разделение кнопок по рядам

Чтобы кнопки стояли в одной строке, укажи одинаковый `row` у нужных элементов:
- `sections[].row`
- `groups[].row`
- `items[].row`
- `buttons[].row`

Для навигационных кнопок:
- `labels.back_row` и `labels.home_row` — если одинаковые, кнопки будут в одной строке.
- `labels.back_order` и `labels.home_order` — порядок отображения.

## Мини-пример

```json
{
  "menu_title": "*Главное меню*",
  "menu_image": "shitystuff/mango.png",
  "labels": {
    "back": "Назад",
    "home": "Главное меню",
    "price": "Цена",
    "back_row": 100,
    "home_row": 100
  },
  "sections": [
    {
      "id": "log",
      "title": "Лог",
      "text": "допишу разделы",
      "groups": [
        {
          "id": "cryptolog",
          "title": "Криптолог",
          "items": [
            {
              "id": "button1",
              "title": "Кнопка 1",
              "price": "100",
              "description": "Описание",
              "image": "shitystuff/mango.png"
            }
          ]
        }
      ]
    }
  ]
}
```

## Остатки (inventory.json)

Файл `database/inventory.json` хранит количество поштучных товаров.
Если товара нет в этом файле — считается безлимитным.

Формат:

```json
{
  "items": {
    "section_id:group_id:item_id": 5
  }
}
```

Для вложенных групп используйте путь через `/`:

```json
{
  "items": {
    "section_id:group_id/subgroup_id:item_id": 2
  }
}
```

Пример:

```json
{
  "items": {
    "log:cryptolog:button1": 3
  }
}
```

Если количество = 0:
- кнопка товара будет зачёркнутой и последней в своём ряду;
- при нажатии появляется окно "нет в наличии".
