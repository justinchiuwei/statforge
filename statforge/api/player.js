import {route} from '../server/routes.js';
export default route(url=>{
 const id=url.pathname.match(/^\/api\/players\/(\d{1,12})\/games$/)?.[1]||url.searchParams.get('id');
 return /^\d{1,12}$/.test(id||'')?`/api/players/${id}/games`:null;
});
