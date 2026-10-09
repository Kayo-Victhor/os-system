import { proxyApiRequest } from "./_proxy.js";

export default {
  fetch(request: Request): Promise<Response> {
    return proxyApiRequest(request, process.env);
  },
};
