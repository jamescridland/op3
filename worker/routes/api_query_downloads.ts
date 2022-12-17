import { Blobs } from '../backend/blobs.ts';
import { computeShowDailyKey, computeShowDailyKeyPrefix, unpackShowDailyKey } from '../backend/downloads.ts';
import { check, checkMatches } from '../check.ts';
import { packError } from '../errors.ts';
import { newForbiddenJsonResponse, newJsonResponse, newMethodNotAllowedResponse, newTextResponse } from '../responses.ts';
import { ApiTokenPermission, hasPermission } from '../rpc_model.ts';
import { yieldTsvFromStream } from '../streams.ts';
import { isValidUuid } from '../uuid.ts';
import { QUERY_DOWNLOADS } from './api_contract.ts';
import { ApiQueryCommonParameters, computeApiQueryCommonParameters, newQueryResponse } from './api_query_common.ts';

export async function computeQueryDownloadsResponse(permissions: ReadonlySet<ApiTokenPermission>, method: string, path: string, searchParams: URLSearchParams, {statsBlobs, roStatsBlobs}: { statsBlobs?: Blobs, roStatsBlobs?: Blobs }): Promise<Response> {
    if (!hasPermission(permissions, 'preview', 'read-data')) return newForbiddenJsonResponse();
    if (method !== 'GET') return newMethodNotAllowedResponse(method);

    let req: QueryShowDownloadsRequest;
    try {
        req = parseRequest(path, searchParams);
    } catch (e) {
        const { message } = packError(e);
        return newJsonResponse({ message }, 400);
    }
    const targetStatsBlobs = searchParams.has('ro') ? roStatsBlobs : statsBlobs;
    if (!targetStatsBlobs) return newJsonResponse({ message: 'statsBlobs is required' }, 500);
    return await computeQueryDownloadsResponseInternal(req, { statsBlobs: targetStatsBlobs });
}

export async function computeQueryDownloadsResponseInternal(request: QueryShowDownloadsRequest, { statsBlobs }: { statsBlobs: Blobs }): Promise<Response> {
    const { showUuid, bots = 'exclude', limit, startTimeInclusive, startTimeExclusive, endTimeExclusive, format = 'tsv' } = request;

    const date = startTimeInclusive ? startTimeInclusive.substring(0, 10) : startTimeExclusive ? startTimeExclusive.substring(0, 10) : await computeEarliestShowDownloadDate(showUuid, statsBlobs);
    if (!date) return newTextResponse('', 404);

    const startTime = Date.now();

    const stream = await statsBlobs.get(computeShowDailyKey({ date, showUuid }), 'stream');

    const rows: unknown[] = [];
    if (stream) {
        for await (const obj of yieldTsvFromStream(stream)) {
            const { time, serverUrl, audienceId, showUuid, episodeId, hashedIpAddress, agentType, agentName, deviceType, deviceName, referrerType, referrerName, botType, countryCode, continentCode, regionCode, regionName, timezone, metroCode } = obj;
            if (botType && bots === 'exclude') continue;
            if (format === 'tsv' || format === 'json-a') {
                const arr = [ time, serverUrl, audienceId, showUuid, episodeId, hashedIpAddress, agentType, agentName, deviceType, deviceName, referrerType, referrerName, botType, countryCode, continentCode, regionCode, regionName, timezone, metroCode ];
                rows.push(format === 'tsv' ? arr.join('\t') : arr);
            } else {
                rows.push({ time, serverUrl, audienceId, showUuid, episodeId, hashedIpAddress, agentType, agentName, deviceType, deviceName, referrerType, referrerName, botType, countryCode, continentCode, regionCode, regionName, timezone, metroCode });
            }
        }
    }

    return newQueryResponse({ startTime, format, headers, rows })
}

const headers = [ 'time', 'serverUrl', 'audienceId', 'showUuid', 'episodeId', 'hashedIpAddress', 'agentType', 'agentName', 'deviceType', 'deviceName', 'referrerType', 'referrerName', 'botType', 'countryCode', 'continentCode', 'regionCode', 'regionName', 'timezone', 'metroCode' ];

//

export interface QueryShowDownloadsRequest extends ApiQueryCommonParameters {
    readonly showUuid: string;
    readonly bots?: 'include' | 'exclude';
}

//

function parseRequest(path: string, searchParams: URLSearchParams): QueryShowDownloadsRequest {
    const m = /^\/downloads\/show\/(.*?)$/.exec(path);
    if (!m) throw new Error(`Bad api path: ${path}`);
    
    const [ _, showUuid ] = m;
    check('showUuid', showUuid, isValidUuid);

    let request: QueryShowDownloadsRequest = { showUuid, ...computeApiQueryCommonParameters(searchParams, QUERY_DOWNLOADS) };
    const { bots } = Object.fromEntries(searchParams);
    if (typeof bots === 'string') {
        checkMatches('bots', bots, /^(include|exclude)$/);
        request = { ...request, bots: bots as 'include' | 'exclude' };
    }
    return request;
}

async function computeEarliestShowDownloadDate(showUuid: string, statsBlobs: Blobs): Promise<string | undefined> {
    const { keys } = await statsBlobs.list({ keyPrefix: computeShowDailyKeyPrefix({ showUuid })});
    return keys.length > 0 ? unpackShowDailyKey(keys[0]).date : undefined;
}
