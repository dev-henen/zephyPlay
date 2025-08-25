import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  // No default link. If ?u=... present we forward it (page can still call /api/metadata),
  // otherwise initialUrl is null and the client will ask the user to paste one.
  const incoming = url.searchParams.get('u') ?? null;
  return {
    initialUrl: incoming,
    meta: null
  };
};
