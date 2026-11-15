import {handleApi} from './research.js';
export function route(pathForRequest){return {
 async fetch(request){
  const url=new URL(request.url),pathname=pathForRequest(url);
  if(!pathname)return Response.json({error:'A valid NBA player ID is required'},{status:400});
  url.pathname=pathname;
  return handleApi(new Request(url,request),{THE_ODDS_API_KEY:process.env.THE_ODDS_API_KEY});
 }
};}
