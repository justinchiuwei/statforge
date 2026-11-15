import {evRoute} from '../server/ev.js';
export default {async fetch(request){return evRoute.fetch(request)}};
