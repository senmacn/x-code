"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProxyAgent = getProxyAgent;
const https_proxy_agent_1 = require("https-proxy-agent");
function getProxyAgent(proxyUrl) {
    if (!proxyUrl)
        return undefined;
    return new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
}
//# sourceMappingURL=proxy.js.map