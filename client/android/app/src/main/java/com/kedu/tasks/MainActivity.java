package com.kedu.tasks;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSendIntent(intent);
    }

    /** 接收其他应用分享过来的文字或链接，转成添加任务弹窗 */
    private void handleSendIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return;
        }
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if ((text == null || text.isEmpty()) && (subject == null || subject.isEmpty())) {
            return;
        }

        StringBuilder url = new StringBuilder("http://localhost/?share=1");
        if (subject != null && !subject.isEmpty()) {
            url.append("&title=").append(Uri.encode(subject));
        }
        if (text != null && !text.isEmpty()) {
            url.append("&text=").append(Uri.encode(text));
        }

        final String target = url.toString();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(target));
        }
        // 清除 action，避免后续重复处理
        intent.setAction(null);
    }
}
