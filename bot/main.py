import asyncio
import html
import json
import os
import re
import secrets
import string
from datetime import datetime, timezone
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    Message,
    FSInputFile,
    InlineKeyboardButton,
    InputMediaPhoto,
)
from aiogram.utils.keyboard import InlineKeyboardBuilder

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN env var is not set")

ADMIN_IDS = {1524752351, 1158027951}
ADMIN_PENDING = {}
ADMIN_SECTION_ID = "admin"
ADMIN_HISTORY_SECTION_ID = "admin_history"

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_FILE = BASE_DIR / "database" / "users.json"
CONTENT_FILE = BASE_DIR / "database" / "content.json"
HISTORY_FILE = BASE_DIR / "database" / "history.json"
ADMIN_MESSAGES_FILE = BASE_DIR / "database" / "admin_messages.json"
ADMIN_MEDIA_DIR = BASE_DIR / "database" / "admin_media"
INVENTORY_FILE = BASE_DIR / "database" / "inventory.json"
IMAGE_PATH = BASE_DIR / "shitystuff" / "mango.png"
DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
ADMIN_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

WRITE_LOCK = asyncio.Lock()
HISTORY_LOCK = asyncio.Lock()
ADMIN_MESSAGES_LOCK = asyncio.Lock()
INVENTORY_LOCK = asyncio.Lock()

dp = Dispatcher()

DEFAULT_MENU_TITLE = "Menu"
DEFAULT_HISTORY_TEMPLATE = (
    'Order number: "{order_number}"\n'
    "Code: {order_code}\n"
    "Item: {item_title}"
)
DEFAULT_LABELS = {
    "back": "Back",
    "home": "Home",
    "price": "Price",
    "purchase": "Purchase",
    "history_next": "Next",
    "history_prev": "Prev",
    "history_row": 200,
    "history_next_order": 20,
    "history_prev_order": 10,
    "back_order": 10000,
    "home_order": 10001,
    "back_row": None,
    "home_row": None,
    "back_style": "",
    "home_style": "",
    "history_prev_style": "",
    "history_next_style": "",
    "back_color": "",
    "home_color": "",
    "history_prev_color": "",
    "history_next_color": "",
    "back_icon_custom_emoji_id": "",
    "home_icon_custom_emoji_id": "",
    "history_prev_icon_custom_emoji_id": "",
    "history_next_icon_custom_emoji_id": "",
}
DEFAULT_ADMIN_HISTORY_TEMPLATE = (
    "Дата: {timestamp}\n"
    "Админ: {admin_id}\n"
    "Кому: {target}\n"
    "Режим: {mode}\n"
    "Тип: {content_type}\n"
    "Текст: {text}\n"
    "Файл: `{media_path}`"
)
DEFAULT_OUT_OF_STOCK_TEXT = "Нет в наличии"


def load_content():
    if not CONTENT_FILE.exists():
        return {"menu_title": DEFAULT_MENU_TITLE, "sections": [], "labels": DEFAULT_LABELS}
    try:
        return json.loads(CONTENT_FILE.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError:
        return {"menu_title": DEFAULT_MENU_TITLE, "sections": [], "labels": DEFAULT_LABELS}


def resolve_path(value):
    if not value:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = BASE_DIR / path
    return path


def read_text_file(value):
    path = resolve_path(value)
    if path and path.exists():
        return path.read_text(encoding="utf-8")
    return ""


class SafeDict(dict):
    def __missing__(self, key):
        return ""


def render_template(template, user):
    data = {
        "id": user.id,
        "username": user.username or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "language_code": user.language_code or "",
    }
    return template.format_map(SafeDict(data))


def sort_entries(entries):
    return sorted(
        entries,
        key=lambda item: (
            item.get("order", 1000),
            str(item.get("title") or item.get("text", "")),
        ),
    )


def build_keyboard(entries):
    builder = InlineKeyboardBuilder()
    rows = group_rows(entries)
    supports_style = False
    if hasattr(InlineKeyboardButton, "model_fields"):
        supports_style = "style" in InlineKeyboardButton.model_fields
    elif hasattr(InlineKeyboardButton, "__fields__"):
        supports_style = "style" in InlineKeyboardButton.__fields__
    supports_icon = False
    if hasattr(InlineKeyboardButton, "model_fields"):
        supports_icon = "icon_custom_emoji_id" in InlineKeyboardButton.model_fields
    elif hasattr(InlineKeyboardButton, "__fields__"):
        supports_icon = "icon_custom_emoji_id" in InlineKeyboardButton.__fields__
    for row in rows:
        buttons = []
        for entry in row["buttons"]:
            kwargs = {
                "text": entry["text"],
                "callback_data": entry["callback_data"],
            }
            if supports_style and entry.get("style"):
                kwargs["style"] = entry["style"]
            if supports_icon and entry.get("icon_custom_emoji_id"):
                kwargs["icon_custom_emoji_id"] = entry["icon_custom_emoji_id"]
            buttons.append(InlineKeyboardButton(**kwargs))
        builder.row(*buttons)
    return builder.as_markup()


def group_rows(entries):
    row_map = {}
    solo_rows = []

    for entry in sort_entries(entries):
        row_id = entry.get("row")
        order = entry.get("order", 1000)
        if row_id is None:
            solo_rows.append(
                {
                    "order": order,
                    "row_id": None,
                    "buttons": [entry],
                }
            )
            continue

        row = row_map.get(row_id)
        if not row:
            row = {
                "order": order,
                "row_id": row_id,
                "buttons": [],
            }
            row_map[row_id] = row
        row["order"] = min(row["order"], order)
        row["buttons"].append(entry)

    rows = solo_rows + list(row_map.values())
    rows.sort(key=lambda row: (row["order"], str(row["row_id"])))
    for row in rows:
        row["buttons"] = sort_entries(row["buttons"])
    return rows


def make_nav_entry(labels, key, callback_data):
    return {
        "text": labels.get(key, key),
        "callback_data": callback_data,
        "order": labels.get(f"{key}_order", 10000),
        "row": labels.get(f"{key}_row"),
        "style": labels.get(f"{key}_style"),
        "icon_custom_emoji_id": labels.get(f"{key}_icon_custom_emoji_id"),
    }


def get_labels(content):
    labels = content.get("labels", {}) if isinstance(content, dict) else {}
    merged = dict(DEFAULT_LABELS)
    merged.update(labels)
    return merged


def get_out_of_stock_text(content, item=None):
    if item and item.get("out_of_stock_text"):
        return str(item.get("out_of_stock_text"))
    return str(content.get("out_of_stock_text", DEFAULT_OUT_OF_STOCK_TEXT))


def format_text(raw):
    if raw is None:
        return ""
    original = str(raw)
    placeholders = []

    def replace_block(match):
        placeholders.append(("block", match.group(1)))
        return f"@@CODE{len(placeholders) - 1}@@"

    def replace_inline(match):
        placeholders.append(("inline", match.group(1)))
        return f"@@CODE{len(placeholders) - 1}@@"

    text = re.sub(r"```(.*?)```", replace_block, original, flags=re.S)
    text = re.sub(r"`([^`]+)`", replace_inline, text)
    text = html.escape(text)
    text = re.sub(r"(?m)^:quote:\s*(.+)$", r"<blockquote>\1</blockquote>", text)
    text = re.sub(r"\*\[(.+?)\]\*", r'<span class="tg-spoiler">\1</span>', text)
    text = re.sub(r"__(.+?)__", r"<u>\1</u>", text)
    text = re.sub(r"\*(.+?)\*", r"<b>\1</b>", text)
    text = re.sub(r"_(.+?)_", r"<i>\1</i>", text)
    text = re.sub(r"(?<!\w)-(\S(.*?\S)?)-(?!\w)", r"<s>\1</s>", text)
    for index, (kind, content) in enumerate(placeholders):
        escaped = html.escape(content)
        if kind == "block":
            replacement = f"<pre>{escaped}</pre>"
        else:
            replacement = f"<code>{escaped}</code>"
        text = text.replace(f"@@CODE{index}@@", replacement)
    return text


def strike_text(value):
    text = str(value)
    return "".join((char + "\u0336") if char.strip() else char for char in text)


async def try_edit_media(message, image_path, caption, reply_markup):
    formatted = format_text(caption)
    try:
        await message.edit_media(
            InputMediaPhoto(
                media=FSInputFile(str(image_path)),
                caption=formatted,
                parse_mode="HTML",
            ),
            reply_markup=reply_markup,
        )
        return True
    except Exception:
        try:
            await message.edit_media(
                InputMediaPhoto(
                    media=FSInputFile(str(image_path)),
                    caption=str(caption),
                ),
                reply_markup=reply_markup,
            )
            return True
        except Exception:
            return False


async def try_send_photo(bot, chat_id, image_path, caption, reply_markup):
    formatted = format_text(caption)
    try:
        await bot.send_photo(
            chat_id=chat_id,
            photo=FSInputFile(str(image_path)),
            caption=formatted,
            parse_mode="HTML",
            reply_markup=reply_markup,
        )
        return True
    except Exception:
        await bot.send_photo(
            chat_id=chat_id,
            photo=FSInputFile(str(image_path)),
            caption=str(caption),
            reply_markup=reply_markup,
        )
        return True


def iter_sections(sections, parent_id=None):
    for section in sections or []:
        yield section, parent_id
        child_sections = section.get("sections", [])
        if child_sections:
            yield from iter_sections(child_sections, section.get("id"))


def find_section(content, section_id):
    for section, _parent_id in iter_sections(content.get("sections", [])):
        if section.get("id") == section_id:
            return section
    return None


def find_section_with_parent(content, section_id):
    for section, parent_id in iter_sections(content.get("sections", [])):
        if section.get("id") == section_id:
            return section, parent_id
    return None, None


def find_section_path(content, section_id):
    def walk(sections, trail):
        for section in sections or []:
            current_trail = trail + [section]
            if section.get("id") == section_id:
                return current_trail
            child_path = walk(section.get("sections", []), current_trail)
            if child_path:
                return child_path
        return None

    return walk(content.get("sections", []), [])


def parse_group_path(value):
    if not value:
        return []
    return [part for part in value.split("/") if part]


def join_group_path(parts):
    return "/".join(part for part in parts if part)


def find_group_by_path(section, group_path):
    groups = section.get("groups", [])
    current = None
    for group_id in group_path:
        current = next((group for group in groups if group.get("id") == group_id), None)
        if not current:
            return None
        groups = current.get("groups", [])
    return current


def find_item(group, item_id):
    for item in group.get("items", []):
        if item.get("id") == item_id:
            return item
    return None


def build_main_menu(content, user_id=None):
    entries = []
    sections = content.get("sections", [])
    is_admin_user = user_id is not None and is_admin(user_id)
    for section in sort_entries(sections):
        if section.get("admin_only") and not is_admin_user:
            continue
        section_id = section.get("id")
        title = section.get("title")
        if not section_id or not title:
            continue
        entries.append(
            {
                "text": title,
                "callback_data": f"section:{section_id}",
                "order": section.get("order", 1000),
                "row": section.get("row"),
                "style": section.get("style"),
                "icon_custom_emoji_id": section.get("icon_custom_emoji_id"),
            }
        )
    return build_keyboard(entries)


def build_section_menu(section_id, section, labels, parent_id=None, user_id=None):
    entries = []

    for subsection in section.get("sections", []):
        sub_id = subsection.get("id")
        title = subsection.get("title")
        if not sub_id or not title:
            continue
        if subsection.get("admin_only") and not is_admin(user_id or 0):
            continue
        entries.append(
            {
                "text": title,
                "callback_data": f"section:{sub_id}",
                "order": subsection.get("order", 1000),
                "row": subsection.get("row"),
                "style": subsection.get("style"),
                "icon_custom_emoji_id": subsection.get("icon_custom_emoji_id"),
            }
        )

    for group in section.get("groups", []):
        group_id = group.get("id")
        title = group.get("title")
        if not group_id or not title:
            continue
        entries.append(
            {
                "text": title,
                "callback_data": f"group:{section_id}:{group_id}",
                "order": group.get("order", 1000),
                "row": group.get("row"),
                "style": group.get("style"),
                "icon_custom_emoji_id": group.get("icon_custom_emoji_id"),
            }
        )

    for button in section.get("buttons", []):
        action = button.get("action")
        title = button.get("title")
        if not action or not title:
            continue
        entries.append(
            {
                "text": title,
                "callback_data": f"action:{action}",
                "order": button.get("order", 1000),
                "row": button.get("row"),
                "style": button.get("style"),
                "icon_custom_emoji_id": button.get("icon_custom_emoji_id"),
            }
        )

    if parent_id:
        entries.append(make_nav_entry(labels, "back", f"section:{parent_id}"))
    entries.append(make_nav_entry(labels, "home", "home"))
    return build_keyboard(entries)


def build_group_menu(section_id, group_path, group, labels, inventory=None):
    entries = []
    inventory_data = inventory or load_inventory()
    for subgroup in group.get("groups", []):
        sub_id = subgroup.get("id")
        title = subgroup.get("title")
        if not sub_id or not title:
            continue
        sub_path = group_path + [sub_id]
        entries.append(
            {
                "text": title,
                "callback_data": f"group:{section_id}:{join_group_path(sub_path)}",
                "order": subgroup.get("order", 1000),
                "row": subgroup.get("row"),
                "style": subgroup.get("style"),
                "icon_custom_emoji_id": subgroup.get("icon_custom_emoji_id"),
            }
        )
    for item in group.get("items", []):
        item_id = item.get("id")
        title = item.get("title")
        if not item_id or not title:
            continue
        item_key = build_item_key(section_id, join_group_path(group_path), item_id)
        tracked, qty = get_item_stock(inventory_data, item_key)
        out_of_stock = tracked and (qty or 0) <= 0
        text = strike_text(title) if out_of_stock else title
        order = item.get("order", 1000)
        entries.append(
            {
                "text": text,
                "callback_data": f"item:{section_id}:{join_group_path(group_path)}:{item_id}",
                "order": order,
                "row": item.get("row"),
                "style": "danger" if out_of_stock else item.get("style"),
                "icon_custom_emoji_id": (
                    "5774077015388852135"
                    if out_of_stock
                    else item.get("icon_custom_emoji_id")
                ),
            }
        )

    if len(group_path) > 1:
        parent_path = join_group_path(group_path[:-1])
        entries.append(make_nav_entry(labels, "back", f"group:{section_id}:{parent_path}"))
    else:
        entries.append(make_nav_entry(labels, "back", f"section:{section_id}"))
    entries.append(make_nav_entry(labels, "home", "home"))
    return build_keyboard(entries)


def build_item_menu(section_id, group_path, item_id, labels, item, include_purchase=True):
    entries = []
    purchase = item.get("purchase", {})
    if include_purchase and purchase:
        title = purchase.get("title") or labels.get("purchase", "Purchase")
        entries.append(
            {
                "text": title,
                "callback_data": f"buy:{section_id}:{group_path}:{item_id}",
                "order": purchase.get("order", 1000),
                "row": purchase.get("row"),
                "style": purchase.get("style"),
                "icon_custom_emoji_id": purchase.get("icon_custom_emoji_id"),
            }
        )
    entries.append(make_nav_entry(labels, "back", f"group:{section_id}:{group_path}"))
    entries.append(make_nav_entry(labels, "home", "home"))
    return build_keyboard(entries)


def build_history_menu(labels, has_prev, has_next):
    row_id = labels.get("history_row")
    entries = []
    if has_next:
        entries.append(
            {
                "text": labels.get("history_next", "Next"),
                "callback_data": "history:next",
                "order": labels.get("history_next_order", 20),
                "row": row_id,
                "style": labels.get("history_next_style"),
                "icon_custom_emoji_id": labels.get("history_next_icon_custom_emoji_id"),
            }
        )
    if has_prev:
        entries.append(
            {
                "text": labels.get("history_prev", "Prev"),
                "callback_data": "history:prev",
                "order": labels.get("history_prev_order", 10),
                "row": row_id,
                "style": labels.get("history_prev_style"),
                "icon_custom_emoji_id": labels.get("history_prev_icon_custom_emoji_id"),
            }
        )
    entries.append(make_nav_entry(labels, "home", "home"))
    return build_keyboard(entries)


def build_item_text(item, labels):
    lines = []
    title = item.get("title")
    if title:
        lines.append(str(title))
    price = item.get("price")
    if price is not None and price != "":
        price_label = labels.get("price", "Price")
        lines.append(f"{price_label}: {price}")
    description = item.get("description")
    if description:
        lines.append(str(description))
    return "\n".join(lines).strip()


def get_section_text(section, user):
    if "template" in section:
        return render_template(section.get("template", ""), user)
    if "file" in section:
        return read_text_file(section.get("file"))
    return str(section.get("text") or section.get("description", "")).strip()


async def show_menu_message(message, text, reply_markup, prefer_edit):
    if not message:
        return
    formatted = format_text(text)
    if prefer_edit:
        try:
            if message.photo:
                await message.edit_caption(
                    formatted,
                    reply_markup=reply_markup,
                    parse_mode="HTML",
                )
            else:
                await message.edit_text(
                    formatted,
                    reply_markup=reply_markup,
                    parse_mode="HTML",
                )
            return
        except Exception:
            pass
    await message.answer(formatted, reply_markup=reply_markup, parse_mode="HTML")


async def show_menu_with_image(message, text, reply_markup, prefer_edit, image_path):
    if not message:
        return
    if image_path and image_path.exists():
        if prefer_edit:
            if await try_edit_media(message, image_path, text, reply_markup):
                return
        if not message.photo:
            try:
                await message.delete()
            except Exception:
                pass
        await try_send_photo(message.bot, message.chat.id, image_path, text, reply_markup)
        return
    await show_menu_message(message, text, reply_markup, prefer_edit)


async def show_text_message(message, text, reply_markup, prefer_edit):
    if not message:
        return
    formatted = format_text(text)
    if message.photo:
        try:
            await message.delete()
        except Exception:
            pass
        await message.bot.send_message(
            chat_id=message.chat.id,
            text=formatted,
            reply_markup=reply_markup,
            parse_mode="HTML",
        )
        return
    if prefer_edit:
        try:
            await message.edit_text(formatted, reply_markup=reply_markup, parse_mode="HTML")
            return
        except Exception:
            pass
    await message.answer(formatted, reply_markup=reply_markup, parse_mode="HTML")


async def show_main_menu(message, prefer_edit=False, user_id=None):
    content = load_content()
    title = str(content.get("menu_title", DEFAULT_MENU_TITLE))
    if user_id is None and message and message.from_user and not message.from_user.is_bot:
        user_id = message.from_user.id
    menu_markup = build_main_menu(content, user_id)
    image_path = resolve_path(content.get("menu_image"))
    if image_path and image_path.exists():
        caption_source = content.get("menu_caption", title)
        if message and prefer_edit and message.photo:
            if await try_edit_media(message, image_path, caption_source, menu_markup):
                return
        if message:
            if not message.photo:
                try:
                    await message.delete()
                except Exception:
                    pass
            await try_send_photo(
                message.bot,
                message.chat.id,
                image_path,
                caption_source,
                menu_markup,
            )
        return
    await show_text_message(message, title, menu_markup, prefer_edit)


async def send_callback_menu(callback, text, reply_markup, image_path=None):
    if callback.message:
        await show_menu_with_image(
            callback.message,
            text,
            reply_markup,
            prefer_edit=True,
            image_path=image_path,
        )
    else:
        if image_path and image_path.exists():
            await try_send_photo(
                callback.bot,
                callback.from_user.id,
                image_path,
                text,
                reply_markup,
            )
            return
        await callback.bot.send_message(
            chat_id=callback.from_user.id,
            text=format_text(text),
            reply_markup=reply_markup,
            parse_mode="HTML",
        )


async def send_text_only_callback(callback, text, reply_markup, prefer_edit=True):
    formatted = format_text(text)
    if callback.message:
        if callback.message.photo:
            try:
                await callback.message.delete()
            except Exception:
                pass
            await callback.bot.send_message(
                chat_id=callback.message.chat.id,
                text=formatted,
                reply_markup=reply_markup,
                parse_mode="HTML",
            )
            return
        if prefer_edit:
            try:
                await callback.message.edit_text(
                    formatted,
                    reply_markup=reply_markup,
                    parse_mode="HTML",
                )
                return
            except Exception:
                pass
        await callback.message.answer(
            formatted,
            reply_markup=reply_markup,
            parse_mode="HTML",
        )
    else:
        await callback.bot.send_message(
            chat_id=callback.from_user.id,
            text=formatted,
            reply_markup=reply_markup,
            parse_mode="HTML",
        )


async def show_history(callback, content, labels, section):
    entries, cursor = await get_history_state(callback.from_user.id)
    if not entries:
        empty_text = section.get("empty_text") or section.get("text") or "History is empty"
        image_path = resolve_path(section.get("image"))
        await send_callback_menu(
            callback,
            empty_text,
            build_history_menu(labels, False, False),
            image_path=image_path,
        )
        return

    template = content.get("history_template", DEFAULT_HISTORY_TEMPLATE)
    entry = entries[cursor]
    text = render_history_text(template, entry)
    has_prev = cursor > 0
    has_next = cursor < len(entries) - 1
    image_value = entry.get("item_image") or section.get("image")
    image_path = resolve_path(image_value)
    await send_callback_menu(
        callback,
        text,
        build_history_menu(labels, has_prev, has_next),
        image_path=image_path,
    )


def load_db():
    if not DATA_FILE.exists():
        return {}
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_db(data):
    tmp = DATA_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DATA_FILE)


def load_history():
    if not HISTORY_FILE.exists():
        return {}
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_history(data):
    tmp = HISTORY_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(HISTORY_FILE)


def load_inventory():
    if not INVENTORY_FILE.exists():
        return {"items": {}}
    try:
        data = json.loads(INVENTORY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"items": {}}
    if not isinstance(data, dict):
        return {"items": {}}
    if "items" not in data or not isinstance(data["items"], dict):
        data["items"] = {}
    return data


def save_inventory(data):
    tmp = INVENTORY_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(INVENTORY_FILE)


def build_item_key(section_id, group_path, item_id):
    group_part = group_path
    if isinstance(group_part, (list, tuple)):
        group_part = join_group_path(group_part)
    return f"{section_id}:{group_part}:{item_id}"


def extract_quantity(value):
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get("qty", value.get("count", value.get("quantity")))
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def get_item_stock(inventory, item_key):
    items = inventory.get("items", {}) if isinstance(inventory, dict) else {}
    if item_key not in items:
        return False, None
    quantity = extract_quantity(items.get(item_key))
    return True, quantity if quantity is not None else 0


def generate_order_code():
    alphabet = string.ascii_lowercase
    chunks = []
    for _ in range(3):
        chunks.append("".join(secrets.choice(alphabet) for _ in range(6)))
    return "-".join(chunks)


def render_history_text(template, entry):
    return template.format_map(SafeDict(entry))


async def add_history_entry(user_id, item_title, item_image=None):
    user_key = str(user_id)
    async with HISTORY_LOCK:
        data = load_history()
        state = data.get(user_key, {"entries": [], "cursor": 0})
        entries = state.get("entries", [])
        order_number = len(entries) + 1
        entry = {
            "order_number": order_number,
            "order_code": generate_order_code(),
            "item_title": item_title,
            "item_image": item_image or "",
        }
        entries.append(entry)
        state["entries"] = entries
        state["cursor"] = len(entries) - 1
        data[user_key] = state
        save_history(data)
    return entry


async def get_history_state(user_id):
    user_key = str(user_id)
    async with HISTORY_LOCK:
        data = load_history()
        state = data.get(user_key, {"entries": [], "cursor": 0})
        entries = state.get("entries", [])
        cursor = state.get("cursor", len(entries) - 1)
        if entries:
            cursor = max(0, min(cursor, len(entries) - 1))
        else:
            cursor = 0
        state["cursor"] = cursor
        data[user_key] = state
        save_history(data)
    return entries, cursor


async def move_history_cursor(user_id, delta):
    user_key = str(user_id)
    async with HISTORY_LOCK:
        data = load_history()
        state = data.get(user_key, {"entries": [], "cursor": 0})
        entries = state.get("entries", [])
        if not entries:
            return [], 0
        cursor = state.get("cursor", len(entries) - 1)
        cursor = max(0, min(cursor + delta, len(entries) - 1))
        state["cursor"] = cursor
        data[user_key] = state
        save_history(data)
    return entries, cursor


def load_admin_messages():
    if not ADMIN_MESSAGES_FILE.exists():
        return {"entries": [], "cursor": {}}
    try:
        return json.loads(ADMIN_MESSAGES_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"entries": [], "cursor": {}}


def save_admin_messages(data):
    tmp = ADMIN_MESSAGES_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(ADMIN_MESSAGES_FILE)


async def download_media(bot, media_obj, dest_path):
    try:
        await media_obj.download(destination=dest_path)
        return True
    except Exception:
        try:
            await bot.download(media_obj, destination=dest_path)
            return True
        except Exception:
            try:
                await bot.download(media_obj.file_id, destination=dest_path)
                return True
            except Exception:
                return False


def build_admin_media_path(prefix, extension):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    token = secrets.token_hex(3)
    filename = f"{prefix}_{timestamp}_{token}{extension}"
    return ADMIN_MEDIA_DIR / filename


async def extract_admin_payload(message: Message):
    content_type = "text"
    text = message.text or ""
    media_obj = None
    extension = ""

    if message.sticker:
        content_type = "sticker"
        if message.sticker.is_animated:
            extension = ".tgs"
        elif message.sticker.is_video:
            extension = ".webm"
        else:
            extension = ".webp"
        media_obj = message.sticker
        text = message.caption or ""
    elif message.audio:
        content_type = "audio"
        extension = ".mp3"
        media_obj = message.audio
        text = message.caption or ""
    elif message.voice:
        content_type = "voice"
        extension = ".ogg"
        media_obj = message.voice
        text = message.caption or ""
    elif message.video:
        content_type = "video"
        extension = ".mp4"
        media_obj = message.video
        text = message.caption or ""
    elif message.video_note:
        content_type = "video_note"
        extension = ".mp4"
        media_obj = message.video_note
        text = message.caption or ""
    elif message.photo:
        content_type = "photo"
        extension = ".jpg"
        media_obj = message.photo[-1]
        text = message.caption or ""
    elif message.document:
        content_type = "document"
        extension = ".bin"
        media_obj = message.document
        text = message.caption or ""

    media_path = ""
    if media_obj:
        file_path = build_admin_media_path(content_type, extension)
        ok = await download_media(message.bot, media_obj, file_path)
        if ok:
            media_path = str(file_path.relative_to(BASE_DIR)).replace("\\", "/")

    return content_type, text, media_path


async def add_admin_message_entry(admin_id, mode, target_id, message: Message):
    content_type, text, media_path = await extract_admin_payload(message)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "admin_id": admin_id,
        "mode": mode,
        "target_id": target_id or "",
        "target": "всем" if mode == "all" else str(target_id or ""),
        "content_type": content_type,
        "text": text or "",
        "media_path": media_path or "",
    }
    async with ADMIN_MESSAGES_LOCK:
        data = load_admin_messages()
        entries = data.get("entries", [])
        entry["id"] = len(entries) + 1
        entries.append(entry)
        data["entries"] = entries
        cursor_map = data.get("cursor", {})
        cursor_map[str(admin_id)] = len(entries) - 1
        data["cursor"] = cursor_map
        save_admin_messages(data)
    return entry


async def get_admin_history_state(admin_id):
    admin_key = str(admin_id)
    async with ADMIN_MESSAGES_LOCK:
        data = load_admin_messages()
        entries = data.get("entries", [])
        cursor_map = data.get("cursor", {})
        cursor = cursor_map.get(admin_key, len(entries) - 1 if entries else 0)
        if entries:
            cursor = max(0, min(cursor, len(entries) - 1))
        else:
            cursor = 0
        cursor_map[admin_key] = cursor
        data["cursor"] = cursor_map
        save_admin_messages(data)
    return entries, cursor


async def move_admin_history_cursor(admin_id, delta):
    admin_key = str(admin_id)
    async with ADMIN_MESSAGES_LOCK:
        data = load_admin_messages()
        entries = data.get("entries", [])
        if not entries:
            return [], 0
        cursor_map = data.get("cursor", {})
        cursor = cursor_map.get(admin_key, len(entries) - 1)
        cursor = max(0, min(cursor + delta, len(entries) - 1))
        cursor_map[admin_key] = cursor
        data["cursor"] = cursor_map
        save_admin_messages(data)
    return entries, cursor


def build_admin_history_menu(labels, has_prev, has_next):
    row_id = labels.get("history_row")
    entries = []
    if has_prev:
        entries.append(
            {
                "text": labels.get("history_prev", "Prev"),
                "callback_data": "admin_history:prev",
                "order": labels.get("history_prev_order", 10),
                "row": row_id,
                "style": labels.get("history_prev_style"),
                "icon_custom_emoji_id": labels.get("history_prev_icon_custom_emoji_id"),
            }
        )
    if has_next:
        entries.append(
            {
                "text": labels.get("history_next", "Next"),
                "callback_data": "admin_history:next",
                "order": labels.get("history_next_order", 20),
                "row": row_id,
                "style": labels.get("history_next_style"),
                "icon_custom_emoji_id": labels.get("history_next_icon_custom_emoji_id"),
            }
        )
    entries.append(make_nav_entry(labels, "back", f"section:{ADMIN_SECTION_ID}"))
    entries.append(make_nav_entry(labels, "home", "home"))
    return build_keyboard(entries)


async def show_admin_history(callback, content, labels, section):
    entries, cursor = await get_admin_history_state(callback.from_user.id)
    if not entries:
        empty_text = section.get("empty_text") or "РСЃС‚РѕСЂРёСЏ СЃРѕРѕР±С‰РµРЅРёР№ РїСѓСЃС‚Р°."
        await send_text_only_callback(
            callback,
            empty_text,
            build_admin_history_menu(labels, False, False),
        )
        return

    template = content.get("admin_history_template", DEFAULT_ADMIN_HISTORY_TEMPLATE)
    entry = entries[cursor]
    text = render_history_text(template, entry)
    has_prev = cursor > 0
    has_next = cursor < len(entries) - 1
    await send_text_only_callback(
        callback,
        text,
        build_admin_history_menu(labels, has_prev, has_next),
    )


async def delete_message_safe(message):
    try:
        await message.delete()
    except Exception:
        pass


async def send_admin_status(message, text, delay=3):
    try:
        status = await message.answer(text)
    except Exception:
        status = None
    await delete_message_safe(message)
    if status:
        await asyncio.sleep(delay)
        await delete_message_safe(status)


def build_user_record(user):
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "language_code": user.language_code,
        "saved_at_utc": datetime.now(timezone.utc).isoformat(),
        "is_premium": user.is_premium,
        "is_bot": user.is_bot,
    }


async def save_user_record(user):
    record = build_user_record(user)
    async with WRITE_LOCK:
        data = load_db()
        data[str(user.id)] = record
        save_db(data)


def is_admin(user_id):
    return user_id in ADMIN_IDS


def set_admin_pending(user_id, mode, target=None):
    ADMIN_PENDING[user_id] = {"mode": mode, "target": target}


def clear_admin_pending(user_id):
    ADMIN_PENDING.pop(user_id, None)


@dp.message(CommandStart())
async def cmd_start(message: Message):
    await save_user_record(message.from_user)
    await show_main_menu(message)
    """
    await message.answer(
        "РќР°Р¶РјРё РєРЅРѕРїРєСѓ, Рё СЏ РІС‹СЂРµР¶Сѓ С‚РІРѕСЋ СЃРµРјСЊСЋ рџ¤І.",
        reply_markup=build_keyboard(),
    )
    """


@dp.callback_query(F.data == "save_user")
async def on_save_user(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    await callback.answer()
    """
    await callback.answer("РёР·Рё Р±СЂРёРґР¶Рё")
    if callback.message:
        #await callback.message.answer("Р“РѕС‚РѕРІРѕ.")
        if IMAGE_PATH.exists():
            await callback.message.answer_photo(
                photo=FSInputFile(str(IMAGE_PATH)),
                caption="",
            )
    else:
        if IMAGE_PATH.exists():
            await callback.bot.send_photo(
                chat_id=callback.from_user.id,
                photo=FSInputFile(str(IMAGE_PATH)),
                caption="mango.png",
            )
    """


@dp.callback_query(F.data == "home")
async def on_home(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    content = load_content()
    await callback.answer()
    if callback.message:
        await show_main_menu(callback.message, prefer_edit=True, user_id=callback.from_user.id)
        return

    title = str(content.get("menu_title", DEFAULT_MENU_TITLE))
    menu_markup = build_main_menu(content, callback.from_user.id)
    image_path = resolve_path(content.get("menu_image"))
    if image_path and image_path.exists():
        caption_source = content.get("menu_caption", title)
        await try_send_photo(
            callback.bot,
            callback.from_user.id,
            image_path,
            caption_source,
            menu_markup,
        )
        return

    await send_callback_menu(callback, title, menu_markup)


@dp.callback_query(F.data.startswith("section:"))
async def on_section(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    content = load_content()
    labels = get_labels(content)
    section_id = callback.data.split(":", 1)[1]
    path = find_section_path(content, section_id)
    if not path:
        await callback.answer()
        return
    section = path[-1]
    parent = path[-2] if len(path) > 1 else None

    if any(item.get("admin_only") for item in path) and not is_admin(callback.from_user.id):
        await callback.answer()
        return

    if section.get("admin_history") or section_id == ADMIN_HISTORY_SECTION_ID:
        if not is_admin(callback.from_user.id):
            await callback.answer()
            return
        await callback.answer()
        await show_admin_history(callback, content, labels, section)
        return

    if section.get("history") or section_id == "history":
        await callback.answer()
        await show_history(callback, content, labels, section)
        return

    text = get_section_text(section, callback.from_user)
    if not text:
        text = str(section.get("title", ""))

    await callback.answer()
    parent_id = parent.get("id") if parent else None
    menu_markup = build_section_menu(
        section_id,
        section,
        labels,
        parent_id=parent_id,
        user_id=callback.from_user.id,
    )
    image_path = resolve_path(section.get("image"))
    if image_path and image_path.exists():
        caption_source = section.get("image_caption", text or section.get("title", ""))
        if callback.message and callback.message.photo:
            if await try_edit_media(callback.message, image_path, caption_source, menu_markup):
                return
        if callback.message:
            if not callback.message.photo:
                try:
                    await callback.message.delete()
                except Exception:
                    pass
            await try_send_photo(
                callback.bot,
                callback.message.chat.id,
                image_path,
                caption_source,
                menu_markup,
            )
            return
        await try_send_photo(
            callback.bot,
            callback.from_user.id,
            image_path,
            caption_source,
            menu_markup,
        )
        return

    await send_text_only_callback(callback, text, menu_markup)


@dp.callback_query(F.data.startswith("group:"))
async def on_group(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    parts = callback.data.split(":", 2)
    if len(parts) < 3:
        await callback.answer()
        return

    section_id, group_path_raw = parts[1], parts[2]
    group_path = parse_group_path(group_path_raw)
    content = load_content()
    labels = get_labels(content)
    section = find_section(content, section_id)
    if not section:
        await callback.answer()
        return

    group = find_group_by_path(section, group_path)
    if not group:
        await callback.answer()
        return

    text = str(group.get("description") or group.get("title") or "")
    await callback.answer()
    inventory_data = load_inventory()
    menu_markup = build_group_menu(section_id, group_path, group, labels, inventory_data)
    image_path = resolve_path(group.get("image"))
    if image_path and image_path.exists():
        caption_source = group.get("image_caption", text or group.get("title", ""))
        if callback.message and callback.message.photo:
            if await try_edit_media(callback.message, image_path, caption_source, menu_markup):
                return
        if callback.message:
            if not callback.message.photo:
                try:
                    await callback.message.delete()
                except Exception:
                    pass
            await try_send_photo(
                callback.bot,
                callback.message.chat.id,
                image_path,
                caption_source,
                menu_markup,
            )
            return
        await try_send_photo(
            callback.bot,
            callback.from_user.id,
            image_path,
            caption_source,
            menu_markup,
        )
        return

    await send_text_only_callback(callback, text, menu_markup)


@dp.callback_query(F.data.startswith("item:"))
async def on_item(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    parts = callback.data.split(":", 3)
    if len(parts) < 4:
        await callback.answer()
        return

    section_id, group_path_raw, item_id = parts[1], parts[2], parts[3]
    group_path = parse_group_path(group_path_raw)
    content = load_content()
    labels = get_labels(content)
    section = find_section(content, section_id)
    if not section:
        await callback.answer()
        return

    group = find_group_by_path(section, group_path)
    if not group:
        await callback.answer()
        return

    item = find_item(group, item_id)
    if not item:
        await callback.answer()
        return

    inventory_data = load_inventory()
    item_key = build_item_key(section_id, group_path_raw, item_id)
    tracked, qty = get_item_stock(inventory_data, item_key)
    if tracked and (qty or 0) <= 0:
        await callback.answer(get_out_of_stock_text(content, item), show_alert=True)
        return

    text = build_item_text(item, labels) or str(item.get("title", ""))
    formatted = format_text(text)
    image_path = resolve_path(item.get("image"))
    item_markup = build_item_menu(section_id, group_path_raw, item_id, labels, item)

    await callback.answer()
    if image_path and image_path.exists():
        if callback.message and callback.message.photo:
            if await try_edit_media(callback.message, image_path, text, item_markup):
                return
        if callback.message:
            if not callback.message.photo:
                try:
                    await callback.message.delete()
                except Exception:
                    pass
            await try_send_photo(
                callback.bot,
                callback.message.chat.id,
                image_path,
                text,
                item_markup,
            )
            return
        await try_send_photo(
            callback.bot,
            callback.from_user.id,
            image_path,
            text,
            item_markup,
        )
    else:
        await send_text_only_callback(callback, text, item_markup)


@dp.callback_query(F.data.startswith("buy:"))
async def on_buy(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    parts = callback.data.split(":", 3)
    if len(parts) < 4:
        await callback.answer()
        return

    section_id, group_path_raw, item_id = parts[1], parts[2], parts[3]
    group_path = parse_group_path(group_path_raw)
    content = load_content()
    labels = get_labels(content)
    section = find_section(content, section_id)
    if not section:
        await callback.answer()
        return

    group = find_group_by_path(section, group_path)
    if not group:
        await callback.answer()
        return

    item = find_item(group, item_id)
    if not item:
        await callback.answer()
        return

    inventory_data = load_inventory()
    item_key = build_item_key(section_id, group_path_raw, item_id)
    tracked, qty = get_item_stock(inventory_data, item_key)
    if tracked and (qty or 0) <= 0:
        await callback.answer(get_out_of_stock_text(content, item), show_alert=True)
        return

    entry = await add_history_entry(
        callback.from_user.id,
        item.get("title", ""),
        item.get("image"),
    )
    purchase = item.get("purchase", {})
    template = purchase.get("message") or content.get(
        "purchase_template", DEFAULT_HISTORY_TEMPLATE
    )
    text = render_history_text(template, entry)
    item_markup = build_item_menu(
        section_id,
        group_path_raw,
        item_id,
        labels,
        item,
        include_purchase=False,
    )
    image_value = (
        purchase.get("image")
        or content.get("purchase_image")
        or "shitystuff/blank5_2.png"
    )
    image_path = resolve_path(image_value)

    await callback.answer()
    if image_path and image_path.exists():
        await send_callback_menu(callback, text, item_markup, image_path=image_path)
    else:
        await send_text_only_callback(callback, text, item_markup)

    if tracked:
        async with INVENTORY_LOCK:
            data = load_inventory()
            items = data.get("items", {})
            current = extract_quantity(items.get(item_key))
            if current is None:
                current = 0
            items[item_key] = max(0, current - 1)
            data["items"] = items
            save_inventory(data)


@dp.callback_query(F.data == "history:next")
async def on_history_next(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    content = load_content()
    labels = get_labels(content)
    entries, cursor = await move_history_cursor(callback.from_user.id, 1)
    await callback.answer()
    section = find_section(content, "history") or {}
    if not entries:
        await show_history(callback, content, labels, section)
        return
    template = content.get("history_template", DEFAULT_HISTORY_TEMPLATE)
    entry = entries[cursor]
    text = render_history_text(template, entry)
    has_prev = cursor > 0
    has_next = cursor < len(entries) - 1
    image_value = entry.get("item_image") or section.get("image")
    image_path = resolve_path(image_value)
    await send_callback_menu(
        callback,
        text,
        build_history_menu(labels, has_prev, has_next),
        image_path=image_path,
    )


@dp.callback_query(F.data == "history:prev")
async def on_history_prev(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    content = load_content()
    labels = get_labels(content)
    entries, cursor = await move_history_cursor(callback.from_user.id, -1)
    await callback.answer()
    section = find_section(content, "history") or {}
    if not entries:
        await show_history(callback, content, labels, section)
        return
    template = content.get("history_template", DEFAULT_HISTORY_TEMPLATE)
    entry = entries[cursor]
    text = render_history_text(template, entry)
    has_prev = cursor > 0
    has_next = cursor < len(entries) - 1
    image_value = entry.get("item_image") or section.get("image")
    image_path = resolve_path(image_value)
    await send_callback_menu(
        callback,
        text,
        build_history_menu(labels, has_prev, has_next),
        image_path=image_path,
    )


@dp.callback_query(F.data == "admin_history:next")
async def on_admin_history_next(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    if not is_admin(callback.from_user.id):
        await callback.answer()
        return
    content = load_content()
    labels = get_labels(content)
    await move_admin_history_cursor(callback.from_user.id, 1)
    await callback.answer()
    section = find_section(content, ADMIN_HISTORY_SECTION_ID) or {}
    await show_admin_history(callback, content, labels, section)


@dp.callback_query(F.data == "admin_history:prev")
async def on_admin_history_prev(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    if not is_admin(callback.from_user.id):
        await callback.answer()
        return
    content = load_content()
    labels = get_labels(content)
    await move_admin_history_cursor(callback.from_user.id, -1)
    await callback.answer()
    section = find_section(content, ADMIN_HISTORY_SECTION_ID) or {}
    await show_admin_history(callback, content, labels, section)


@dp.callback_query(F.data.startswith("action:"))
async def on_action(callback: CallbackQuery):
    await save_user_record(callback.from_user)
    action = callback.data.split(":", 1)[1]
    if action == "save_user":
        await save_user_record(callback.from_user)
        await callback.answer()
        return

    if action == "admin_broadcast":
        if not is_admin(callback.from_user.id):
            await callback.answer()
            return
        set_admin_pending(callback.from_user.id, "all")
        await callback.answer("Отправь одно сообщение для рассылки всем.")
        return

    if action == "admin_send_to":
        if not is_admin(callback.from_user.id):
            await callback.answer()
            return
        set_admin_pending(callback.from_user.id, "await_target")
        await callback.answer("Отправь ID пользователя одним сообщением.")
        return

    if action == "admin_history":
        if not is_admin(callback.from_user.id):
            await callback.answer()
            return
        content = load_content()
        labels = get_labels(content)
        section = find_section(content, ADMIN_HISTORY_SECTION_ID) or {}
        await callback.answer()
        await show_admin_history(callback, content, labels, section)
        return

    await callback.answer()


@dp.message(Command("admin"))
async def admin_help(message: Message):
    if not is_admin(message.from_user.id):
        return
    await save_user_record(message.from_user)
    text = (
        "Админ-режим:\n"
        "/all — отправить одно сообщение всем\n"
        "/to <id> — отправить одному пользователю\n"
        "/cancel — отменить режим отправки\n\n"
        "После /all или /to отправь текст/аудио/видео/стикер — он разошлется."
    )
    await send_admin_status(message, text, delay=5)


@dp.message(Command("all"))
@dp.message(Command("broadcast"))
async def admin_broadcast(message: Message):
    if not is_admin(message.from_user.id):
        return
    await save_user_record(message.from_user)
    set_admin_pending(message.from_user.id, "all")
    await send_admin_status(
        message,
        "Режим рассылки всем включен. Отправь одно сообщение/медиа. /cancel для отмены.",
    )


@dp.message(Command("to"))
@dp.message(Command("send"))
async def admin_send_to(message: Message):
    if not is_admin(message.from_user.id):
        return
    await save_user_record(message.from_user)
    if not message.text:
        await send_admin_status(message, "Укажи ID: /to 123456")
        return
    parts = message.text.split(maxsplit=1)
    if len(parts) < 2 or not parts[1].isdigit():
        await send_admin_status(message, "Укажи ID: /to 123456")
        return
    target_id = int(parts[1])
    set_admin_pending(message.from_user.id, "one", target_id)
    await send_admin_status(
        message,
        f"Отправка пользователю {target_id}. Теперь отправь сообщение/медиа. /cancel для отмены.",
    )


@dp.message(Command("cancel"))
async def admin_cancel(message: Message):
    if not is_admin(message.from_user.id):
        return
    clear_admin_pending(message.from_user.id)
    await send_admin_status(message, "Отменено.")


@dp.message()
async def admin_payload(message: Message):
    if not is_admin(message.from_user.id):
        return
    state = ADMIN_PENDING.get(message.from_user.id)
    if not state:
        return
    if message.text and message.text.startswith("/"):
        return

    await save_user_record(message.from_user)

    if state["mode"] == "await_target":
        text = (message.text or "").strip()
        if not text.isdigit():
            await send_admin_status(message, "Отправь ID пользователя числом.")
            return
        target_id = int(text)
        set_admin_pending(message.from_user.id, "one", target_id)
        await send_admin_status(
            message,
            f"ID {target_id} принят. Теперь отправь сообщение/медиа.",
        )
        return

    mode = state["mode"]
    target_id = state.get("target")
    await add_admin_message_entry(message.from_user.id, mode, target_id, message)

    if mode == "all":
        data = load_db()
        user_ids = []
        for key in data.keys():
            if str(key).isdigit():
                user_ids.append(int(key))
        user_ids = [uid for uid in user_ids if uid not in ADMIN_IDS]
        if not user_ids:
            await send_admin_status(message, "Список пользователей пуст.")
            clear_admin_pending(message.from_user.id)
            return
        success = 0
        failed = 0
        for uid in user_ids:
            try:
                await message.copy_to(uid)
                success += 1
            except Exception:
                failed += 1
        await send_admin_status(
            message,
            f"Рассылка завершена. Успешно: {success}, Ошибки: {failed}.",
        )
        clear_admin_pending(message.from_user.id)
        return

    if not target_id:
        await send_admin_status(message, "Целевой ID не задан.")
        clear_admin_pending(message.from_user.id)
        return
    try:
        await message.copy_to(target_id)
        await send_admin_status(message, "Отправлено.")
    except Exception:
        await send_admin_status(
            message,
            "Не удалось отправить. Пользователь мог не писать боту.",
        )
    clear_admin_pending(message.from_user.id)


async def main():
    bot = Bot(token=BOT_TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

