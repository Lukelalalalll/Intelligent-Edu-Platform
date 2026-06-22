"""
Map presentation UI language strings (LanguageType enum values from Next.js) to
Tesseract / LiteParse OCR language codes (ISO 639-3 where applicable).

Keep keys in sync with:
frontend/app/(presentation-generator)/upload/type.ts -> LanguageType
"""

from __future__ import annotations

import re
from typing import Optional

# Values must match `LanguageType` string literals in the upload UI.
PRESENTATION_LANGUAGE_TO_TESSERACT: dict[str, str] = {
    "English": "eng",
    "Spanish (Espa帽ol)": "spa",
    "French (Fran莽ais)": "fra",
    "German (Deutsch)": "deu",
    "Portuguese (Portugu锚s)": "por",
    "Italian (Italiano)": "ita",
    "Dutch (Nederlands)": "nld",
    "Russian (袪褍褋褋泻懈泄)": "rus",
    "Chinese (Simplified - 涓枃, 姹夎)": "chi_sim",
    "Chinese (Traditional - 涓枃, 婕㈣獮)": "chi_tra",
    "Japanese (鏃ユ湰瑾?": "jpn",
    "Korean (頃滉淡鞏?": "kor",
    "Arabic (丕賱毓乇亘賷丞)": "ara",
    "Hindi (啶灌た啶ㄠ啶︵)": "hin",
    "Bengali (唳唳傕Σ唳?": "ben",
    "Polish (Polski)": "pol",
    "Czech (膶e拧tina)": "ces",
    "Slovak (Sloven膷ina)": "slk",
    "Hungarian (Magyar)": "hun",
    "Romanian (Rom芒n膬)": "ron",
    "Bulgarian (袘褗谢谐邪褉褋泻懈)": "bul",
    "Greek (螘位位畏谓喂魏维)": "ell",
    "Serbian (小褉锌褋泻懈 / Srpski)": "srp",
    "Croatian (Hrvatski)": "hrv",
    "Bosnian (Bosanski)": "bos",
    "Slovenian (Sloven拧膷ina)": "slv",
    "Finnish (Suomi)": "fin",
    "Swedish (Svenska)": "swe",
    "Danish (Dansk)": "dan",
    "Norwegian (Norsk)": "nor",
    "Icelandic (脥slenska)": "isl",
    "Lithuanian (Lietuvi懦)": "lit",
    "Latvian (Latvie拧u)": "lav",
    "Estonian (Eesti)": "est",
    "Maltese (Malti)": "mlt",
    "Welsh (Cymraeg)": "cym",
    "Irish (Gaeilge)": "gle",
    "Scottish Gaelic (G脿idhlig)": "gla",
    "Ukrainian (校泻褉邪褩薪褋褜泻邪)": "ukr",
    "Hebrew (注讘专讬转)": "heb",
    "Persian/Farsi (賮丕乇爻蹖)": "fas",
    "Turkish (T眉rk莽e)": "tur",
    "Kurdish (Kurd卯 / 讴賵乇丿蹖)": "kmr",
    "Pashto (倬跉鬲賵)": "pus",
    "Dari (丿乇蹖)": "prs",
    "Uzbek (O驶zbek)": "uzb",
    "Kazakh (覛邪蟹邪覜褕邪)": "kaz",
    "Tajik (孝芯曳懈泻樱)": "tgk",
    "Turkmen (T眉rkmen莽e)": "tuk",
    "Azerbaijani (Az蓹rbaycan dili)": "aze",
    "Urdu (丕乇丿賵)": "urd",
    "Tamil (喈む喈苦喁?": "tam",
    "Telugu (喟む眴喟侧眮喟椸眮)": "tel",
    "Marathi (啶ぐ啶距啷€)": "mar",
    "Punjabi (啜┌啜溹ň啜﹢ / 倬賳噩丕亘蹖)": "pan",
    "Gujarati (嗒椸珌嗒溹嗒距喃€)": "guj",
    "Malayalam (啻床啻淳啻赤磦)": "mal",
    "Kannada (嗖曕波喑嵿波嗖?": "kan",
    "Odia (喱撪喱监喱?": "ori",
    "Sinhala (喾冟窉喽傕穭喽?": "sin",
    "Nepali (啶ㄠ啶ぞ啶侧)": "nep",
    "Thai (喙勦笚喔?": "tha",
    "Vietnamese (Ti岷縩g Vi峄噒)": "vie",
    "Lao (嗪ム翰嗪?": "lao",
    "Khmer (釣椺灦釣熱灦釣佱煉釣樶焸釣?": "khm",
    "Burmese (醼欋€坚€斸€横€欋€€呩€?": "mya",
    "Tagalog/Filipino (Tagalog/Filipino)": "tgl",
    "Javanese (Basa Jawa)": "jav",
    "Sundanese (Basa Sunda)": "sun",
    "Malay (Bahasa Melayu)": "msa",
    "Mongolian (袦芯薪谐芯谢)": "mon",
    "Swahili (Kiswahili)": "swa",
    "Hausa (Hausa)": "hau",
    "Yoruba (Yor霉b谩)": "yor",
    "Igbo (Igbo)": "ibo",
    "Amharic (釆犪垱釄姏)": "amh",
    "Zulu (isiZulu)": "zul",
    "Xhosa (isiXhosa)": "xho",
    "Shona (ChiShona)": "sna",
    "Somali (Soomaaliga)": "som",
    "Basque (Euskara)": "eus",
    "Catalan (Catal脿)": "cat",
    "Galician (Galego)": "glg",
    "Quechua (Runasimi)": "que",
    "Nahuatl (N膩huatl)": "nah",
    "Hawaiian (驶艑lelo Hawai驶i)": "haw",
    "Maori (Te Reo M膩ori)": "mri",
    # No dedicated Tahitian traineddata in default Tesseract bundles.
    "Tahitian (Reo Tahiti)": "eng",
    "Samoan (Gagana Samoa)": "smo",
}

_LOWER_MAP = {k.lower(): v for k, v in PRESENTATION_LANGUAGE_TO_TESSERACT.items()}

_OCR_CODE_RE = re.compile(r"^[a-zA-Z0-9_,+]+$")


def presentation_language_to_ocr_code(language: Optional[str]) -> str:
    """Resolve UI language label to a Tesseract language code; default English."""
    if language is None:
        return "eng"
    s = str(language).strip()
    if not s:
        return "eng"
    if s in PRESENTATION_LANGUAGE_TO_TESSERACT:
        code = PRESENTATION_LANGUAGE_TO_TESSERACT[s]
    else:
        code = _LOWER_MAP.get(s.lower(), "eng")
    if not _OCR_CODE_RE.fullmatch(code):
        return "eng"
    return code

