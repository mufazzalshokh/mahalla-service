import type { IntakeResponse, SupportedLanguage } from '../../application/intake/intake-types.js';

const resources: Readonly<Record<SupportedLanguage, Readonly<Record<string, string>>>> = {
  ru: {
    add_photos: 'Отправьте до 3 фотографий JPEG/PNG или нажмите «Готово».',
    button_accept: 'Принимаю',
    button_confirm: 'Подтвердить',
    button_decline: 'Отказаться',
    button_done: 'Готово',
    button_restart: 'Начать заново',
    choose_category: 'Выберите вид услуги.',
    choose_language: 'Tilni tanlang / Выберите язык.',
    consent_required: 'Для отправки заявки необходимо принять условия конфиденциальности.',
    contact_must_be_own: 'Поделитесь только своим номером Telegram.',
    enter_address: 'Напишите адрес или отправьте геолокацию Telegram.',
    enter_description: 'Опишите проблему, используя от 10 до 2000 символов.',
    invalid_address: 'Адрес должен содержать от 3 до 500 символов.',
    invalid_category: 'Такого вида услуги нет. Выберите услугу из списка.',
    invalid_contact: 'Неверный номер телефона. Используйте кнопку Telegram.',
    invalid_description: 'Описание должно содержать от 10 до 2000 символов.',
    photo_added: 'Фотография принята ({count}/3).',
    photo_invalid: 'Размер фотографии не должен превышать 10 МБ.',
    photo_limit: 'Можно отправить не более 3 фотографий.',
    privacy_notice:
      'Уведомление о конфиденциальности ({version}): контакты, адрес и фотографии сохраняются для выполнения заявки. Вы согласны?',
    review_request:
      'Проверьте заявку:\nУслуга: {category}\nОписание: {description}\nАдрес: {address}\nФотографии: {photoCount}',
    share_contact: 'Поделитесь номером телефона с помощью кнопки Telegram.',
    start_required: 'Для новой заявки нажмите /start. Для проверки статуса введите /status MCK-...',
    status_result: 'Статус {ticketNumber}: {status}',
    submitted: 'Заявка принята. Ваш номер: {ticketNumber}',
    ticket_not_found: 'Заявка с таким номером не найдена или принадлежит другому пользователю.',
    unexpected_error: 'Произошла непредвиденная ошибка. Повторите попытку немного позже.',
  },
  'uz-Cyrl': {
    add_photos: '3 тагача JPEG/PNG расм юборинг ёки «Тайёр» тугмасини босинг.',
    button_accept: 'Қабул қиламан',
    button_confirm: 'Тасдиқлаш',
    button_decline: 'Рад этаман',
    button_done: 'Тайёр',
    button_restart: 'Қайта бошлаш',
    choose_category: 'Хизмат турини танланг.',
    choose_language: 'Тилни танланг / Tilni tanlang.',
    consent_required: 'Сўров юбориш учун махфийлик шартларини қабул қилиш керак.',
    contact_must_be_own: 'Фақат ўз Telegram рақамингизни улашинг.',
    enter_address: 'Манзилни ёзинг ёки Telegram локациясини юборинг.',
    enter_description: 'Муаммони 10–2000 белги билан тушунтиринг.',
    invalid_address: 'Манзил 3–500 белги бўлиши керак.',
    invalid_category: 'Ушбу хизмат тури мавжуд эмас. Рўйхатдан танланг.',
    invalid_contact: 'Телефон рақами нотўғри. Telegram тугмасидан фойдаланинг.',
    invalid_description: 'Тавсиф 10–2000 белги бўлиши керак.',
    photo_added: 'Расм қабул қилинди ({count}/3).',
    photo_invalid: 'Расм ҳажми 10 MB дан ошмаслиги керак.',
    photo_limit: 'Энг кўпи 3 та расм қабул қилинади.',
    privacy_notice:
      'Махфийлик билдиришномаси ({version}): алоқа, манзил ва расмлар сўровни бажариш учун сақланади. Розимисиз?',
    review_request:
      'Текширинг:\nХизмат: {category}\nТавсиф: {description}\nМанзил: {address}\nРасмлар: {photoCount}',
    share_contact: 'Telegram тугмаси орқали телефон рақамингизни улашинг.',
    start_required: 'Янги сўров учун /start ни босинг. Ҳолат учун /status MCK-... ёзинг.',
    status_result: '{ticketNumber} ҳолати: {status}',
    submitted: 'Сўров қабул қилинди. Рақамингиз: {ticketNumber}',
    ticket_not_found: 'Бу рақамли сўров сизга тегишли эмас ёки топилмади.',
    unexpected_error: 'Кутилмаган хато. Бироздан сўнг қайта уриниб кўринг.',
  },
  'uz-Latn': {
    add_photos: '3 tagacha JPEG/PNG rasm yuboring yoki “Tayyor” tugmasini bosing.',
    button_accept: 'Qabul qilaman',
    button_confirm: 'Tasdiqlash',
    button_decline: 'Rad etaman',
    button_done: 'Tayyor',
    button_restart: 'Qayta boshlash',
    choose_category: 'Xizmat turini tanlang.',
    choose_language: 'Tilni tanlang / Тилни танланг.',
    consent_required: "So'rov yuborish uchun maxfiylik shartlarini qabul qilish kerak.",
    contact_must_be_own: "Faqat o'z Telegram raqamingizni ulashing.",
    enter_address: 'Manzilni yozing yoki Telegram lokatsiyasini yuboring.',
    enter_description: 'Muammoni 10–2000 belgi bilan tushuntiring.',
    invalid_address: "Manzil 3–500 belgi bo'lishi kerak.",
    invalid_category: "Bu xizmat turi mavjud emas. Ro'yxatdan tanlang.",
    invalid_contact: "Telefon raqami noto'g'ri. Telegram tugmasidan foydalaning.",
    invalid_description: "Tavsif 10–2000 belgi bo'lishi kerak.",
    photo_added: 'Rasm qabul qilindi ({count}/3).',
    photo_invalid: 'Rasm hajmi 10 MB dan oshmasligi kerak.',
    photo_limit: 'Eng ko‘pi 3 ta rasm qabul qilinadi.',
    privacy_notice:
      "Maxfiylik bildirishnomasi ({version}): aloqa, manzil va rasmlar so'rovni bajarish uchun saqlanadi. Rozimisiz?",
    review_request:
      'Tekshiring:\nXizmat: {category}\nTavsif: {description}\nManzil: {address}\nRasmlar: {photoCount}',
    share_contact: 'Telegram tugmasi orqali telefon raqamingizni ulashing.',
    start_required: "Yangi so'rov uchun /start ni bosing. Holat uchun /status MCK-... yozing.",
    status_result: '{ticketNumber} holati: {status}',
    submitted: "So'rov qabul qilindi. Raqamingiz: {ticketNumber}",
    ticket_not_found: "Bu raqamli so'rov sizga tegishli emas yoki topilmadi.",
    unexpected_error: "Kutilmagan xato. Birozdan so'ng qayta urinib ko'ring.",
  },
};

export function translate(
  language: SupportedLanguage,
  key: string,
  parameters: Readonly<Record<string, string>> = {},
): string {
  const template = resources[language][key] ?? key;
  return Object.entries(parameters).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    template,
  );
}

export function renderResponse(response: IntakeResponse): string {
  return translate(response.language, response.key, response.parameters);
}
