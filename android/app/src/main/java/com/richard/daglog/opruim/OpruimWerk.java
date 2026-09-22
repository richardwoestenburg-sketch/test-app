package com.richard.daglog.opruim;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/**
 * De ronde die zonder jou draait.
 *
 * Twee smaken, allebei via WorkManager zodat Android zelf bepaalt wanneer het
 * uitkomt en de klus ook een herstart overleeft:
 *
 *  - `nu(...)` — één ronde, aangevraagd door de tegel of de widget.
 *  - `plan(...)` — elke nacht rond 03:00, alleen als de telefoon stilligt en
 *    de accu niet laag is. Zo merk je er overdag niets van.
 */
public class OpruimWerk extends Worker {

    public static final String NACHTRONDE = "opruim-nachtronde";
    public static final String NU = "opruim-nu";

    private static final int NACHT_UUR = 3;

    public OpruimWerk(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        OpruimRonde.Uitkomst uit = OpruimMotor.ronde(context);
        OpruimMotor.meld(context, uit);
        return Result.success();
    }

    /** Eén ronde, zo snel als het systeem het toelaat. */
    public static void nu(Context context) {
        WorkManager
            .getInstance(context.getApplicationContext())
            .enqueueUniqueWork(
                NU,
                // Al een ronde onderweg? Dan niet nog een keer — twee keer
                // tegelijk scannen levert niets extra's op.
                ExistingWorkPolicy.KEEP,
                new OneTimeWorkRequest.Builder(OpruimWerk.class).build()
            );
    }

    /** Zet de nachtronde aan of uit. */
    public static void plan(Context context, boolean aan) {
        WorkManager beheer = WorkManager.getInstance(context.getApplicationContext());
        if (!aan) {
            beheer.cancelUniqueWork(NACHTRONDE);
            return;
        }

        Constraints voorwaarden = new Constraints.Builder()
            .setRequiresBatteryNotLow(true)
            .setRequiresDeviceIdle(true)
            .build();

        PeriodicWorkRequest ronde = new PeriodicWorkRequest.Builder(OpruimWerk.class, 1, TimeUnit.DAYS)
            .setConstraints(voorwaarden)
            .setInitialDelay(millisTotNacht(), TimeUnit.MILLISECONDS)
            .build();

        // UPDATE in plaats van KEEP: zet je iets anders aan in de app, dan
        // geldt dat vanaf de eerstvolgende nacht.
        beheer.enqueueUniquePeriodicWork(NACHTRONDE, ExistingPeriodicWorkPolicy.UPDATE, ronde);
    }

    /** Hoeveel milliseconden tot het eerstvolgende moment dat het 03:00 is. */
    static long millisTotNacht() {
        Calendar nu = Calendar.getInstance();
        Calendar doel = (Calendar) nu.clone();
        doel.set(Calendar.HOUR_OF_DAY, NACHT_UUR);
        doel.set(Calendar.MINUTE, 0);
        doel.set(Calendar.SECOND, 0);
        doel.set(Calendar.MILLISECOND, 0);
        if (!doel.after(nu)) doel.add(Calendar.DAY_OF_YEAR, 1);
        return doel.getTimeInMillis() - nu.getTimeInMillis();
    }
}
