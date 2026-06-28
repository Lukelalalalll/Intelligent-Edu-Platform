export interface UploadedFile {
  id: string;
  file: File;
  size: string;
}

export enum ThemeType {
  Light = "light",
  Dark = "dark",
  Custom = "custom",
  Faint_Yellow = "faint_yellow",
  Royal_Blue = "royal_blue",
  Light_Red = "light_red",
  Dark_Pink = "dark_pink",
}

export enum LanguageType {
  // Major World Languages
  Auto = "Auto",
  English = "English",
  Spanish = "Spanish (Espa帽ol)",
  French = "French (Fran莽ais)",
  German = "German (Deutsch)",
  Portuguese = "Portuguese (Portugu锚s)",
  Italian = "Italian (Italiano)",
  Dutch = "Dutch (Nederlands)",
  Russian = "Russian (袪褍褋褋泻懈泄)",
  ChineseSimplified = "Chinese (Simplified - 涓枃, 姹夎)",
  ChineseTraditional = "Chinese (Traditional - 涓枃, 婕㈣獮)",
  CantoneseTraditional = "Cantonese (Traditional - 绮佃獮绻侀珨)",
  Japanese = "Japanese (鏃ユ湰瑾?",
  Korean = "Korean (頃滉淡鞏?",
  Arabic = "Arabic (丕賱毓乇亘賷丞)",
  Hindi = "Hindi (啶灌た啶ㄠ啶︵)",
  Bengali = "Bengali (唳唳傕Σ唳?",

  // European Languages
  Polish = "Polish (Polski)",
  Czech = "Czech (膶e拧tina)",
  Slovak = "Slovak (Sloven膷ina)",
  Hungarian = "Hungarian (Magyar)",
  Romanian = "Romanian (Rom芒n膬)",
  Bulgarian = "Bulgarian (袘褗谢谐邪褉褋泻懈)",
  Greek = "Greek (螘位位畏谓喂魏维)",
  Serbian = "Serbian (小褉锌褋泻懈 / Srpski)",
  Croatian = "Croatian (Hrvatski)",
  Bosnian = "Bosnian (Bosanski)",
  Slovenian = "Slovenian (Sloven拧膷ina)",
  Finnish = "Finnish (Suomi)",
  Swedish = "Swedish (Svenska)",
  Danish = "Danish (Dansk)",
  Norwegian = "Norwegian (Norsk)",
  Icelandic = "Icelandic (脥slenska)",
  Lithuanian = "Lithuanian (Lietuvi懦)",
  Latvian = "Latvian (Latvie拧u)",
  Estonian = "Estonian (Eesti)",
  Maltese = "Maltese (Malti)",
  Welsh = "Welsh (Cymraeg)",
  Irish = "Irish (Gaeilge)",
  ScottishGaelic = "Scottish Gaelic (G脿idhlig)",
  Ukrainian = "Ukrainian (校泻褉邪褩薪褋褜泻邪)",

  // Middle Eastern and Central Asian Languages
  Hebrew = "Hebrew (注讘专讬转)",
  Persian = "Persian/Farsi (賮丕乇爻蹖)",
  Turkish = "Turkish (T眉rk莽e)",
  Kurdish = "Kurdish (Kurd卯 / 讴賵乇丿蹖)",
  Pashto = "Pashto (倬跉鬲賵)",
  Dari = "Dari (丿乇蹖)",
  Uzbek = "Uzbek (O驶zbek)",
  Kazakh = "Kazakh (覛邪蟹邪覜褕邪)",
  Tajik = "Tajik (孝芯曳懈泻樱)",
  Turkmen = "Turkmen (T眉rkmen莽e)",
  Azerbaijani = "Azerbaijani (Az蓹rbaycan dili)",

  // South Asian Languages
  Urdu = "Urdu (丕乇丿賵)",
  Tamil = "Tamil (喈む喈苦喁?",
  Telugu = "Telugu (喟む眴喟侧眮喟椸眮)",
  Marathi = "Marathi (啶ぐ啶距啷€)",
  Punjabi = "Punjabi (啜┌啜溹ň啜﹢ / 倬賳噩丕亘蹖)",
  Gujarati = "Gujarati (嗒椸珌嗒溹嗒距喃€)",
  Malayalam = "Malayalam (啻床啻淳啻赤磦)",
  Kannada = "Kannada (嗖曕波喑嵿波嗖?",
  Odia = "Odia (喱撪喱监喱?",
  Sinhala = "Sinhala (喾冟窉喽傕穭喽?",
  Nepali = "Nepali (啶ㄠ啶ぞ啶侧)",

  // East and Southeast Asian Languages
  Thai = "Thai (喙勦笚喔?",
  Vietnamese = "Vietnamese (Ti岷縩g Vi峄噒)",
  Lao = "Lao (嗪ム翰嗪?",
  Khmer = "Khmer (釣椺灦釣熱灦釣佱煉釣樶焸釣?",
  Burmese = "Burmese (醼欋€坚€斸€横€欋€?",
  Tagalog = "Tagalog/Filipino (Tagalog/Filipino)",
  Javanese = "Javanese (Basa Jawa)",
  Sundanese = "Sundanese (Basa Sunda)",
  Malay = "Malay (Bahasa Melayu)",
  Mongolian = "Mongolian (袦芯薪谐芯谢)",

  // African Languages
  Swahili = "Swahili (Kiswahili)",
  Hausa = "Hausa (Hausa)",
  Yoruba = "Yoruba (Yor霉b谩)",
  Igbo = "Igbo (Igbo)",
  Amharic = "Amharic (釆犪垱釄姏)",
  Zulu = "Zulu (isiZulu)",
  Xhosa = "Xhosa (isiXhosa)",
  Shona = "Shona (ChiShona)",
  Somali = "Somali (Soomaaliga)",

  // Indigenous and Lesser-Known Languages
  Basque = "Basque (Euskara)",
  Catalan = "Catalan (Catal脿)",
  Galician = "Galician (Galego)",
  Quechua = "Quechua (Runasimi)",
  Nahuatl = "Nahuatl (N膩huatl)",
  Hawaiian = "Hawaiian (驶艑lelo Hawai驶i)",
  Maori = "Maori (Te Reo M膩ori)",
  Tahitian = "Tahitian (Reo Tahiti)",
  Samoan = "Samoan (Gagana Samoa)",
}

export interface PresentationConfig {
  slides: string | null;
  language: LanguageType | null;
  prompt: string;
  tone: ToneType;
  verbosity: VerbosityType;
  instructions: string;
  includeTableOfContents: boolean;
  includeTitleSlide: boolean;
  webSearch: boolean;
}

export enum ToneType {
  Default = "default",
  Casual = "casual",
  Professional = "professional",
  Funny = "funny",
  Educational = "educational",
  Sales_Pitch = "sales_pitch",
}

export enum VerbosityType {
  Concise = "concise",
  Standard = "standard",
  Text_Heavy = "text-heavy",
}

