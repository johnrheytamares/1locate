package io.ionic.starter;
import android.Manifest;
import android.os.Build;
import android.os.SystemClock;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
@CapacitorPlugin(name="IndoorSteps", permissions={@Permission(alias="activity",strings={Manifest.permission.ACTIVITY_RECOGNITION})})
public class IndoorStepsPlugin extends Plugin implements SensorEventListener {
  private long lastEvent=0,lastDetector=0;private boolean gravityReady=false;
  private String requestedSession=null; private SensorManager manager; private Sensor sensor; private long started; private float baseline=-1; private int count=0; private String method="none"; private final float[] gravity=new float[3];
  @Override public void load(){manager=(SensorManager)getContext().getSystemService(Context.SENSOR_SERVICE);}
  @PluginMethod public void capabilities(PluginCall call){JSObject out=new JSObject();out.put("detector",manager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)!=null);out.put("counter",manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)!=null);out.put("motion",manager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)!=null||manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)!=null);call.resolve(out);}
  @PluginMethod public void start(PluginCall call){
    requestedSession=call.getString("session");
    boolean hardware=manager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)!=null||manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)!=null;
    if(hardware&&Build.VERSION.SDK_INT>=29&&getPermissionState("activity")!=PermissionState.GRANTED){requestPermissionForAlias("activity",call,"activityResult");return;}begin(call);
  }
  @PermissionCallback private void activityResult(PluginCall call){if(getPermissionState("activity")!=PermissionState.GRANTED){call.reject("Physical activity permission denied. Use manual distance or grant permission and retry.");return;}begin(call);}
  private void begin(PluginCall call){
    if(requestedSession==null||!requestedSession.equals(call.getString("session"))){call.reject("Step session cancelled.");return;}
    stopSensor();sensor=manager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);method="hardware-detector";
    if(sensor==null){sensor=manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);method="hardware-counter";}
    if(sensor==null&&call.getBoolean("allowMotionFallback",false)){sensor=manager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);if(sensor==null)sensor=manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);method="motion-estimate";}
    if(sensor==null){call.reject("No supported step sensor. Calibrate the motion fallback or use measured manual distances.");return;}
    baseline=-1;count=0;lastEvent=0;lastDetector=0;gravityReady=false;gravity[0]=0;gravity[1]=0;gravity[2]=0;started=SystemClock.elapsedRealtimeNanos();
    if(!manager.registerListener(this,sensor,SensorManager.SENSOR_DELAY_GAME)){sensor=null;call.reject("Step sensor could not start.");return;}
    JSObject out=new JSObject();out.put("method",method);out.put("sensorName",sensor.getName());out.put("sensorVendor",sensor.getVendor());call.resolve(out);
  }
  @PluginMethod public void stop(PluginCall call){if(requestedSession!=null&&requestedSession.equals(call.getString("session"))){stopSensor();requestedSession=null;}call.resolve();}
  private void stopSensor(){if(manager!=null)manager.unregisterListener(this);sensor=null;baseline=-1;}
  @Override public void onSensorChanged(SensorEvent event){
    if(sensor==null||event.timestamp<=lastEvent)return;
    long previousEvent=lastEvent;lastEvent=event.timestamp;if(event.timestamp<started&&!(event.sensor.getType()==Sensor.TYPE_STEP_COUNTER&&baseline<0))return;JSObject out=new JSObject();out.put("session",requestedSession);out.put("method",method);out.put("timestamp",System.currentTimeMillis());out.put("sensorName",sensor.getName());out.put("sensorVendor",sensor.getVendor());out.put("sensorTime",event.timestamp/1000000.0);
    if(event.sensor.getType()==Sensor.TYPE_STEP_DETECTOR){if(lastDetector>0&&event.timestamp-lastDetector<250000000L)return;lastDetector=event.timestamp;count++;out.put("steps",count);}
    else if(event.sensor.getType()==Sensor.TYPE_STEP_COUNTER){if(baseline<0||event.values[0]<baseline){baseline=event.values[0];count=0;}count=(int)(event.values[0]-baseline);out.put("steps",count);}
    else {double sum=0;double dt=previousEvent==0?0:(event.timestamp-previousEvent)/1000000.0;double k=dt/(500.0+dt);for(int i=0;i<3;i++){double v=event.values[i];if(event.sensor.getType()==Sensor.TYPE_ACCELEROMETER){if(!gravityReady)gravity[i]=event.values[i];else gravity[i]+=k*(event.values[i]-gravity[i]);v-=gravity[i];}sum+=v*v;}gravityReady=true;out.put("magnitude",Math.sqrt(sum));out.put("motionTime",event.timestamp/1000000.0);}
    notifyListeners("sample",out);
  }
  @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
  @Override protected void handleOnPause(){stopSensor();requestedSession=null;JSObject out=new JSObject();out.put("state","paused");notifyListeners("state",out);}
  @Override protected void handleOnDestroy(){stopSensor();}
}
