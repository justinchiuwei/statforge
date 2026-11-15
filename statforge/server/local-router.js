import ev from '../api/ev.js';
// Local route mapping mirrors vercel.json and the root api/ function files.
import players from '../api/players.js';
import player from '../api/player.js';
import props from '../api/props.js';
import odds from '../api/odds.js';
export function apiHandler(pathname){if(pathname==='/api/ev')return ev;
 if(pathname==='/api/players')return players;
 if(pathname==='/api/props')return props;
 if(pathname==='/api/odds')return odds;
 if(pathname==='/api/player'||/^\/api\/players\/\d{1,12}\/games$/.test(pathname))return player;
 return null;
}
