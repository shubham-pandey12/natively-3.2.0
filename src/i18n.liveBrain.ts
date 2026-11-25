type TranslationRow = readonly [ru: string, zh: string, ja: string, es: string];

const rows: Record<string, TranslationRow> = {
    'Listens to the interviewer in real time and writes answers like a live conversation': [
        'Слушает интервьюера в реальном времени и пишет ответы как в живом разговоре',
        '实时聆听面试官，并像在现场对话中一样撰写回答',
        '面接官の話をリアルタイムで聞き、会話に合わせて回答を書きます',
        'Escucha al entrevistador en tiempo real y redacta respuestas como en una conversación en directo',
    ],
    'Live Brain Provider': ['Провайдер Live Brain', 'Live Brain 提供商', 'Live Brain プロバイダー', 'Proveedor de Live Brain'],
    'Existing pipeline (no extra key)': ['Текущий конвейер (без дополнительного ключа)', '现有流程（无需额外密钥）', '既存のパイプライン（追加キー不要）', 'Flujo actual (sin clave adicional)'],
    'Uses a Google AI Studio key': ['Использует ключ Google AI Studio', '使用 Google AI Studio 密钥', 'Google AI Studio キーを使用', 'Usa una clave de Google AI Studio'],
    'Uses an OpenAI API key': ['Использует ключ API OpenAI', '使用 OpenAI API 密钥', 'OpenAI API キーを使用', 'Usa una clave de API de OpenAI'],
    'Uses the existing Auto Answer engine': ['Использует текущий движок Auto Answer', '使用现有的自动回答引擎', '既存の自動回答エンジンを使用', 'Usa el motor actual de respuesta automática'],
    'Use my AI Providers key': ['Использовать мой ключ из раздела AI Providers', '使用我在 AI Providers 中的密钥', 'AI Providers のキーを使用する', 'Usar mi clave de Proveedores de IA'],
    'Using the key from AI Providers.': ['Используется ключ из раздела AI Providers.', '正在使用 AI Providers 中的密钥。', 'AI Providers のキーを使用しています。', 'Se está usando la clave de Proveedores de IA.'],
    'When Live Brain becomes available, interviewer audio will be sent to the selected provider.': [
        'Когда Live Brain станет доступен, аудио интервьюера будет отправляться выбранному провайдеру.',
        'Live Brain 上线后，面试官的音频将发送给所选提供商。',
        'Live Brain が利用可能になると、面接官の音声が選択したプロバイダーに送信されます。',
        'Cuando Live Brain esté disponible, el audio del entrevistador se enviará al proveedor seleccionado.',
    ],
    'Enter API key': ['Введите ключ API', '输入 API 密钥', 'API キーを入力', 'Introduce la clave de API'],
    'Save model': ['Сохранить модель', '保存模型', 'モデルを保存', 'Guardar modelo'],
    'Instruction variant': ['Вариант инструкций', '指令版本', '指示の種類', 'Variante de instrucciones'],
    'Choose a variant': ['Выберите вариант', '选择版本', '種類を選択', 'Elige una variante'],
    'Full': ['Полный', '完整', '完全版', 'Completa'],
    'Trimmed': ['Сокращённый', '精简', '短縮版', 'Reducida'],
    'Add a Gemini key in Audio → Live Brain Provider.': ['Добавьте ключ Gemini в разделе «Аудио → Провайдер Live Brain».', '请在「音频 → Live Brain 提供商」中添加 Gemini 密钥。', '「オーディオ → Live Brain プロバイダー」で Gemini キーを追加してください。', 'Añade una clave de Gemini en Audio → Proveedor de Live Brain.'],
    'Add an OpenAI key in Audio → Live Brain Provider.': ['Добавьте ключ OpenAI в разделе «Аудио → Провайдер Live Brain».', '请在「音频 → Live Brain 提供商」中添加 OpenAI 密钥。', '「オーディオ → Live Brain プロバイダー」で OpenAI キーを追加してください。', 'Añade una clave de OpenAI en Audio → Proveedor de Live Brain.'],
    'Connection testing is not available yet — brain arrives in Phase 4.': [
        'Проверка соединения пока недоступна. Live Brain появится на этапе 4.',
        '连接测试暂不可用。Live Brain 将在第 4 阶段上线。',
        '接続テストはまだ利用できません。Live Brain はフェーズ 4 で追加されます。',
        'La prueba de conexión aún no está disponible. Live Brain llegará en la fase 4.',
    ],
    'Add an API key first.': ['Сначала добавьте ключ API.', '请先添加 API 密钥。', '先に API キーを追加してください。', 'Añade primero una clave de API.'],
    'The API key format is invalid.': ['Неверный формат ключа API.', 'API 密钥格式无效。', 'API キーの形式が正しくありません。', 'El formato de la clave de API no es válido.'],
    'Could not save the Live Brain API key.': ['Не удалось сохранить ключ API Live Brain.', '无法保存 Live Brain API 密钥。', 'Live Brain の API キーを保存できませんでした。', 'No se pudo guardar la clave de API de Live Brain.'],
    'Could not load Live Brain settings.': ['Не удалось загрузить настройки Live Brain.', '无法加载 Live Brain 设置。', 'Live Brain の設定を読み込めませんでした。', 'No se pudo cargar la configuración de Live Brain.'],
    'Could not save Live Brain settings.': ['Не удалось сохранить настройки Live Brain.', '无法保存 Live Brain 设置。', 'Live Brain の設定を保存できませんでした。', 'No se pudo guardar la configuración de Live Brain.'],
    'Live Brain settings are unavailable.': ['Настройки Live Brain недоступны.', 'Live Brain 设置不可用。', 'Live Brain の設定を利用できません。', 'La configuración de Live Brain no está disponible.'],
    'Could not update Live Brain.': ['Не удалось изменить состояние Live Brain.', '无法更新 Live Brain。', 'Live Brain の状態を変更できませんでした。', 'No se pudo cambiar el estado de Live Brain.'],
};

function column(index: 0 | 1 | 2 | 3): Record<string, string> {
    return Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, row[index]]));
}

export const LIVE_BRAIN_RU = column(0);
export const LIVE_BRAIN_ZH = column(1);
export const LIVE_BRAIN_JA = column(2);
export const LIVE_BRAIN_ES = column(3);
