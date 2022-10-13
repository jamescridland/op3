import { assertEquals } from '../tests/deps.ts';
import { QueryRedirectLogsRequest, Unkinded } from '../rpc_model.ts';
import { computeQueryRedirectLogsResponse } from './api_query_redirect_logs.ts';
import { StubRpcClient } from '../tests/stub_rpc_client.ts';

Deno.test({
    name: 'computeQueryRedirectLogsResponse',
    fn: async () => {
        const rpcClient = new class extends StubRpcClient {
            async queryRedirectLogs(request: Unkinded<QueryRedirectLogsRequest>, target: string): Promise<Response> {
                await Promise.resolve();
                if (request.urlStartsWith === 'https://example.com/path/to/' && target === 'combined-redirect-log') {
                    return new Response('ok!');
                }
                console.log(request, target);
                throw new Error();
            }
        }
        const res = await computeQueryRedirectLogsResponse(new Set([ 'read-data' ]), 'GET', new URLSearchParams({ url: 'https://example.com/path/to/*' }), rpcClient);
        assertEquals(res.status, 200);
    }
});
