# rsshgw

## 動作条件

TypeScriptインタプリタ [deno](https://deno.land/) にPATHが通っていること。(denoは実行ファイルひとつだけで完全に動作できる)

## 起動方法

./server.ts を実行すると、デフォルトでは 8000番でサービスが開始される。

-p オプションでポート番号変更、-h オプションでバインドするIPアドレスを変更

systemdから起動する場合は rsshgw.service ファイルを /etc/systemd/system 以下にコピーし ```systemctl start rsshgw``` する。rsshgw.serviceファイルはユーザー rsshgw, プロジェクトディレクトリ /home/rsshgw/rsshgw を前提にしているので必要に応じて変更する

## IDの追加方法

./create_user を実行し、IDとパスワードを入力

## 動作確認方法

Webブラウザでサービスへアクセスすると簡易UIで機能を確認することができる

## API

### POST /login (ログイン)

アクセストークンを取得するためにはこのAPIを呼び出す。

#### リクエスト

```
{"user":"myuserid","password":"secret"}
```

#### レスポンス

```
{"success":true}
```

このAPIのレスポンスで ```session``` という名前の Cookieがセットされるので、以降のAPI呼び出しではリクエストヘッダにこの Cookieを含めることで認証トークンとする。

### GET /login (ログイン状態のチェック)

ログインAPIで得たアクセストークンが未だ有効かどうかをチェックする。

#### リクエスト

パラメータ無し。ログイン時に得た "session" Cookieがあればヘッダに含める

#### レスポンス

ログインされている場合

```
{"success":true, user:{"id":"myuserid"}}
```

ログインされていない場合

```
{"success":false}
```

### DELETE /login (ログアウト)

アクセストークンを無効にする

#### レスポンス

```
{"success":true}
```

### POST /register-key (SSH公開鍵の登録)

#### リクエスト

```
{"key":"ssh-rsa XXXX...."}
```

#### レスポンス

```
{"success":true}
```

無効な公開鍵を与えた場合 ```400 Bad Request``` を返す

### GET /rsshid/:rsshid (RSSH IDを使用したポート番号の照会)

#### リクエスト

:rsshid : RSSH ID

#### レスポンス

RSSH IDが有効な場合

```
{"success":true, port:12345 }
```

RSSH IDが見つからない場合 ```404 not found``` を返す
