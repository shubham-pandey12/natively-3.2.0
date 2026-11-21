import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as answerLength from '../../i18n.answerLength.ts';

const expected = {
  'Answer length': ['Длина ответа','回答长度','回答の長さ','Longitud de la respuesta'],
  'Shorter': ['Короче','更短','短め','Más corta'],
  'Smart': ['Умная','智能','スマート','Inteligente'],
  'Longer': ['Длиннее','更长','長め','Más larga'],
  '1–2 sentences, 15–35 words': ['1–2 предложения, 15–35 слов','1–2 句，15–35 个词','1〜2文、15〜35語','1–2 frases, 15–35 palabras'],
  'Fits each question, usually 40–60 words': ['Под каждый вопрос, обычно 40–60 слов','按问题调整，通常 40–60 个词','質問に合わせて調整、通常40〜60語','Se ajusta a cada pregunta, normalmente 40–60 palabras'],
  'Fuller answers, 90–200 words': ['Более полные ответы, 90–200 слов','更完整的回答，90–200 个词','より詳しい回答、90〜200語','Respuestas más completas, 90–200 palabras'],
  "Couldn't save the answer length. Please try again.": ['Не удалось сохранить длину ответа. Попробуйте ещё раз.','无法保存回答长度，请重试。','回答の長さを保存できませんでした。もう一度お試しください。','No se pudo guardar la longitud de la respuesta. Inténtalo de nuevo.'],
};

// 3.2.1 keeps the same strings as one column per language (ANSWER_LENGTH_RU …)
// spread into each dictionary, instead of 3.2.0's answerLengthLanguage(index).
test('all recovered answer-length translations match character for character', () => {
  assert.deepEqual([...answerLength.ANSWER_LENGTH_EN], Object.keys(expected));
  const source = fs.readFileSync('src/i18n.tsx', 'utf8');
  for (const [index, lang] of ['RU','ZH','JA','ES'].entries()) {
    const column = answerLength[`ANSWER_LENGTH_${lang}`];
    assert.deepEqual({ ...column }, Object.fromEntries(Object.entries(expected).map(([en, row]) => [en, row[index]])), lang);
    assert.match(source, new RegExp(String.raw`const ${lang}: Record<string, string> = \{[^}]*?\.\.\.ANSWER_LENGTH_${lang},`));
  }
});
