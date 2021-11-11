#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --unstable --watch
import { moveSync } from "https://deno.land/std/fs/move.ts";
import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { Session } from "https://deno.land/x/oak_sessions/mod.ts";
import { DB } from "https://deno.land/x/sqlite/mod.ts";
import { sleep } from "https://deno.land/x/sleep/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import {parse} from "https://deno.land/std/flags/mod.ts";
import {gzip} from "https://deno.land/x/compress/mod.ts";

const args = parse(Deno.args);  // コマンドライン引数のパース

const HOSTNAME = args.h || undefined;   // bindするアドレス
const PORT = args.p || 8000;    // listenするポート
const CLIENT_TS = "./client.ts";    // クライアントアプリのソース

let app_js_gz:Uint8Array | undefined;   // 圧縮したバンドル
let app_js_map_gz:Uint8Array | undefined; // 圧縮したソースマップ
let last_bundled_time = 0;  // バンドル処理を最後に実行したタイムスタンプ

function bundle_client_app():void {
    const client_ts_time = Deno.lstatSync(CLIENT_TS).mtime?.getTime();
    if (!client_ts_time || client_ts_time <= last_bundled_time) return;

    last_bundled_time = client_ts_time;
    
    Deno.emit("./client.ts", {
        bundle: "module",
        compilerOptions: {
            "emitDecoratorMetadata": true,
            lib: ["dom", "esnext"]
        }
    }).then(result=>{
        const textEncoder = new TextEncoder();
        app_js_gz = gzip(textEncoder.encode(result.files["deno:///bundle.js"]));
        app_js_map_gz = gzip(textEncoder.encode(result.files["deno:///bundle.js.map"]));
        console.log("Bundling client app done.");
    }, reason=>{
        console.log("Bundle error! " + reason);
    });
}

bundle_client_app();

const db = new DB("/var/rsshdb.sqlite3", {mode:"read"});
console.log("RSSH database opened");

const user_db = new DB("rsshgw.sqlite3");
console.log("User database opened");

const app = new Application();
const session = new Session();

const router = new Router();
router.get("/", session.initMiddleware(), async (context) => {
    await context.state.session.set("hoge", "fuga");
    context.response.type = "text/html";
    if (await context.state.session.has("user")) {
        context.response.body = Deno.readFileSync("index.html");
    } else {
        context.response.body = Deno.readFileSync("login.html");
    }
})
.get("/app.js", (context) => {
    context.response.type = "application/javascript";
    if (!app_js_gz) {
        // まだバンドル処理が終わってない場合は503
        context.response.status = 503;
        context.response.body = "console.log('503 Service Temporarily Unavailable');";
        return;
    }
    //else
    context.response.headers.set("Content-Encoding", "gzip");
    context.response.body = app_js_gz;
})
.get("/app.js.map", context => { // ソースマップを出力
    context.response.type = "application/json";
    if (!app_js_map_gz) {
        context.response.status = 503;
        context.response.body = "[\"503 Service Temporarily Unavailable\"]";
        return;
    }
    //else
    context.response.headers.set("Content-Encoding", "gzip");
    context.response.body = app_js_map_gz;
})
.get("/app.html", session.initMiddleware(), async (context) => {
    if (!await context.state.session.has("user")) {
        context.response.status = 403;
        context.response.body = "Not authorized";
        return;
    }
    //else
    context.response.type = "text/html";
    context.response.body = Deno.readFileSync("app.html");
})
.post("/login", session.initMiddleware(), async (context) => {
    const body = await (await context.request.body({type:"json"})).value;
    const users = user_db.query("select id,password from users where id=?", [body.id]);
    context.response.type = "application/json";
    if (users.length == 1 && bcrypt.compareSync(body.password, users[0].at(1) as string)) {
        await context.state.session.set("user", {id: users[0].at(0) as string});
        context.response.body = '{"success":true}';
    } else {
        await sleep(1);
        context.response.body = '{"success":false}';
    }
})
.get("/login", session.initMiddleware(), async (context) => {
    context.response.type = "application/json";
    if (await context.state.session.has("user")) {
        const user = await context.state.session.get("user");
        context.response.body = JSON.stringify({success:true, user:user});
    } else {
        context.response.body = '{"success":false}';
    }
})
.delete("/login", session.initMiddleware(), async (context) => {
    await session.deleteSession(context);
    context.response.type = "application/json";
    context.response.body = '{"success":true}';
})
.get("/rsshid/:rsshid", session.initMiddleware(), async (context) => {
    if (!await context.state.session.has("user")) {
        context.response.status = 403;
        context.response.body = "Not authorized";
        return;
    }
    //else
    context.response.type = "application/json";
    const rows = db.query("select value from rsshtb where key=?", ["//port/" + context.params.rsshid?.toUpperCase()]);
    if (rows.length < 1) {
        context.response.status = 404;
        context.response.body = '["RSSHID Not found"]';
        return;
    }
    //else
    context.response.body = JSON.stringify({
        success:true, rsshid:context.params.rsshid, 
        host:context.request.url.hostname,
        port:rows[0][0] as number
    });
})
.post("/register-key", session.initMiddleware(), async (context) => {
    if (!await context.state.session.has("user")) {
        context.response.status = 403;
        context.response.body = "Not authorized";
        return;
    }

    const trim_key = (key:string) => {
        const splitted = key.split(' ');
        return splitted.length > 1? splitted[0] + ' ' + splitted[1] : undefined;
    };

    const HOME = Deno.env.get("HOME");
    if (HOME === undefined) {
        context.response.status = 404;
        context.response.body = "No $HOME env";
        return;
    }

    const body = await (await context.request.body({type:"json"})).value;

    const new_key = body.key? trim_key(body.key) : undefined;
    if (new_key === undefined) {
        context.response.status = 400;
        context.response.body = "No key provided or bad key";
        return;
    }

    context.response.type = "application/json";
    const authorized_keys = HOME + "/.ssh/authorized_keys";
    const authorized_keys_content = Deno.readTextFileSync(authorized_keys);
    const keys = new Set<string>();
    for (const line of authorized_keys_content.split('\n')) {
        const key = trim_key(line);
        if (key === undefined) continue;
        //else
        keys.add(key);
    }
    keys.add(new_key);

    let buf = "";
    keys.forEach (key=> {
        buf += key;
        buf += '\n';
    });
    const authorized_keys_new = HOME + "/.ssh/authorized_keys.new";
    Deno.writeTextFileSync(authorized_keys_new, buf);
    if (context.request.url.hostname !== "localhost") {
        moveSync(authorized_keys_new, authorized_keys, { overwrite: true });
    }
    
    context.response.body = '{"success":true}';
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Starting server" + (HOSTNAME? ' ' + HOSTNAME : "") + " at port " + PORT + ".");
app.listen({ hostname: HOSTNAME, port: PORT });

const watcher = Deno.watchFs(CLIENT_TS);
for await (const event of watcher) {
    if (event.kind == "modify") bundle_client_app();
}