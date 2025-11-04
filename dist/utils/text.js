"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncate = truncate;
function truncate(text, max) {
    return text.length > max ? text.slice(0, max - 3) + "..." : text;
}
//# sourceMappingURL=text.js.map