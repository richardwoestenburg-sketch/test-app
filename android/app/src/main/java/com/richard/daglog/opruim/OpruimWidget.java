package com.richard.daglog.opruim;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;
import android.widget.Toast;

import com.richard.daglog.R;

/**
 * De knop op je startscherm. Eén tik zet dezelfde ronde in de wachtrij als de
 * tegel; de widget zelf laat alleen zien wat de vorige keer vrijkwam.
 */
public class OpruimWidget extends AppWidgetProvider {

    private static final String ACTIE_OPRUIMEN = "com.richard.daglog.OPRUIMEN";

    @Override
    public void onUpdate(Context context, AppWidgetManager beheer, int[] widgetIds) {
        for (int id : widgetIds) tekenWidget(context, beheer, id);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTIE_OPRUIMEN.equals(intent.getAction())) return;

        if (!OpruimMotor.heeftOpslagToegang(context)) {
            Toast.makeText(context, "Open Opruimen in de app om toegang te geven", Toast.LENGTH_LONG).show();
            return;
        }
        OpruimWerk.nu(context);
        Toast.makeText(context, "Opruimen gestart", Toast.LENGTH_SHORT).show();
        werkAlleBij(context);
    }

    static void werkAlleBij(Context context) {
        AppWidgetManager beheer = AppWidgetManager.getInstance(context);
        int[] ids = beheer.getAppWidgetIds(new ComponentName(context, OpruimWidget.class));
        for (int id : ids) tekenWidget(context, beheer, id);
    }

    private static void tekenWidget(Context context, AppWidgetManager beheer, int widgetId) {
        RemoteViews weergave = new RemoteViews(context.getPackageName(), R.layout.opruim_widget);

        long bytes = OpruimMotor.prefs(context).getLong(OpruimMotor.SLEUTEL_LAATSTE_BYTES, 0);
        weergave.setTextViewText(
            R.id.opruim_widget_onder,
            bytes > 0 ? OpruimMotor.fmtBytes(bytes) + " vrij" : "tik om op te ruimen"
        );

        Intent bedoeling = new Intent(context, OpruimWidget.class);
        bedoeling.setAction(ACTIE_OPRUIMEN);
        int vlaggen = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) vlaggen |= PendingIntent.FLAG_IMMUTABLE;
        weergave.setOnClickPendingIntent(
            R.id.opruim_widget_knop,
            PendingIntent.getBroadcast(context, 0, bedoeling, vlaggen)
        );

        beheer.updateAppWidget(widgetId, weergave);
    }
}
