import "https://cdn.skypack.dev/reflect-metadata";

import {BrowserModule} from "https://cdn.skypack.dev/@angular/platform-browser@11?dts";
import {platformBrowserDynamic} from "https://cdn.skypack.dev/@angular/platform-browser-dynamic@11?dts";
import {enableProdMode,NgModule,Component,Inject} from "https://cdn.skypack.dev/@angular/core@11?dts";
import {FormsModule} from "https://cdn.skypack.dev/@angular/forms@11?dts";
import {HttpClient,HttpClientModule,HttpErrorResponse } from 'https://cdn.skypack.dev/@angular/common@11/http?dts';

import "https://cdn.skypack.dev/zone.js";

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    providers: [Location]
})
class AppComponent {
    rsshid = "";
    errors:{port?:string,register?:string} = {};
    messages:{register?:string} = {};
    port:number | undefined;
    key = "";

    constructor(@Inject(HttpClient) private http:HttpClient) {
        
    }

    hostname() : string {
        return location.hostname;
    }

    checkPortNumber() : void {
        delete this.errors.port;
        this.http.get<{success:boolean,port:number|undefined}>(`./rsshid/${this.rsshid}`).subscribe((json) => {
            if (json.success) {
                this.port = json.port;
            } else {
                this.errors.port = "RSSH IDが見つかりません";
            }
            console.log(json);

        }, (err:HttpErrorResponse)=> {
            if (err.status == 404) this.errors.port = "RSSH IDが見つかりません";
            else this.errors.port = "サーバーエラー";
            console.log(err);
        });
    }

    registerKey() : void {
        delete this.errors.register;
        delete this.messages.register;
        if (this.key.length < 64 || this.key.indexOf(' ') < 0 || !this.key.startsWith("ssh-")) {
            this.errors.register = "正しい公開鍵を入力してください";
            return;
        }

        this.http.post<{success:boolean}>("./register-key", {key:this.key}).subscribe((json) => {
            if (json.success) {
                this.messages.register = "公開鍵が登録されました";
            } else {
                this.errors.register = "公開鍵を登録できませんでした";
            }
        }, (err:HttpErrorResponse) => {
            if (err.status == 400) {
                this.errors.register = "正しい公開鍵を入力してください";
            } else {
                this.errors.register = "サーバーエラー";
            }
        });
    }
}

@NgModule({
    declarations: [AppComponent],
    imports: [BrowserModule,FormsModule,HttpClientModule],
    providers: [],
    bootstrap: [AppComponent]
})
class AppModule {
}

if (location.hostname != "localhost") enableProdMode();
platformBrowserDynamic().bootstrapModule(AppModule);
