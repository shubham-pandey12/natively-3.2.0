"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// premium/electron/autoAnswer/decider/layaTokenizer.ts
var layaTokenizer_exports = {};
__export(layaTokenizer_exports, {
  LAYA_SPECIAL_TOKENS: () => LAYA_SPECIAL_TOKENS,
  adaptTokenizer: () => adaptTokenizer,
  specialTokensFromConfig: () => specialTokensFromConfig
});
module.exports = __toCommonJS(layaTokenizer_exports);
var LAYA_SPECIAL_TOKENS = { mask: "[MASK]", cls: "[CLS]", sep: "[SEP]", pad: "[PAD]" };
function specialTokensFromConfig(config) {
  const pick = (key, fallback) => {
    const v = config?.[key];
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof v.content === "string") return v.content;
    return fallback;
  };
  return {
    mask: pick("mask_token", LAYA_SPECIAL_TOKENS.mask),
    cls: pick("cls_token", LAYA_SPECIAL_TOKENS.cls),
    sep: pick("sep_token", LAYA_SPECIAL_TOKENS.sep),
    pad: pick("pad_token", LAYA_SPECIAL_TOKENS.pad)
  };
}
function adaptTokenizer(tok, special = LAYA_SPECIAL_TOKENS) {
  const id = (token) => {
    const v = tok.model?.tokens_to_ids?.get(token);
    if (typeof v !== "number") throw new Error(`decider tokenizer has no id for special token ${token}`);
    return v;
  };
  const maskTokenId = id(special.mask);
  const clsTokenId = id(special.cls);
  const sepTokenId = id(special.sep);
  const padTokenId = id(special.pad);
  return {
    encode: (text) => Array.from(tok.encode(text, { add_special_tokens: false }), Number),
    maskToken: special.mask,
    maskTokenId,
    clsTokenId,
    sepTokenId,
    padTokenId
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LAYA_SPECIAL_TOKENS,
  adaptTokenizer,
  specialTokensFromConfig
});
