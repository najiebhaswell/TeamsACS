package supervise

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ca17/teamsacs/app"
	"github.com/ca17/teamsacs/common"
	"github.com/ca17/teamsacs/common/cwmp"
	"github.com/ca17/teamsacs/common/web"
	"github.com/ca17/teamsacs/common/zaplog/log"
	"github.com/ca17/teamsacs/events"
	"github.com/ca17/teamsacs/models"
	"github.com/labstack/echo/v4"
)

var cwmpCmds = []SuperviseAction{
	{Name: "Test cpe cwmp connection", Type: "cwmp", Level: "normal", Sid: "cwmpDeviceConnectTest"},
	{Name: "Get the list of RPC methods", Type: "cwmp", Level: "normal", Sid: "cwmpGetRPCMethods"},
	{Name: "Get a list of parameter prefixes", Type: "cwmp", Level: "normal", Sid: "cwmpGetParameterNames"},
	{Name: "Get and update device information", Type: "cwmp", Level: "normal", Sid: "cwmpDeviceInfoUpdate"},
	{Name: "Configure device authentication information", Type: "cwmp", Level: "normal", Sid: "cwmpDeviceManagementAuthUpdate"},
	{Name: "Upload device logs", Type: "cwmp", Level: "normal", Sid: "cwmpDeviceUploadLog"},
	{Name: "Upload device backup (text)", Type: "cwmp", Level: "normal", Sid: "cwmpDeviceBackup"},
	{Name: "Download the factory configuration", Type: "cwmp", Level: "major", Sid: "cwmpFactoryConfiguration"},
	{Name: "Factory reset", Type: "cwmp", Level: "major", Sid: "cwmpFactoryReset"},
	{Name: "Restart the device", Type: "cwmp", Level: "major", Sid: "cwmpReboot"},
	// ONT-specific commands
	{Name: "Get ONT optical info", Type: "cwmp", Level: "normal", Sid: "cwmpOntOpticalInfo"},
	{Name: "Get ONT WAN info", Type: "cwmp", Level: "normal", Sid: "cwmpOntWanInfo"},
	{Name: "Get WiFi SSID", Type: "cwmp", Level: "normal", Sid: "cwmpWifiSsid"},
}

func execCwmp(c echo.Context, id string, deviceId int64, session string) error {
	var dev models.NetCpe
	common.Must(app.GDB().Where("id=?", deviceId).First(&dev).Error)
	if common.IsEmptyOrNA(dev.Sn) {
		return c.JSON(http.StatusOK, web.RestError(fmt.Sprintf("Device SN %s invalid", dev.Sn)))
	}

	switch id {
	case "cwmpFactoryConfiguration":
		return execCwmpFactoryConfiguration(c, id, deviceId, session)
	case "cwmpReboot":
		go cwmpDeviceReboot(id, dev, session)
	case "cwmpFactoryReset":
		go cwmpDeviceFactoryReset(id, dev, session)
	case "cwmpDeviceInfoUpdate":
		go cwmpDeviceInfoUpdate(id, dev, session)
	case "cwmpDeviceManagementAuthUpdate":
		go cwmpDeviceManagementAuthUpdate(id, dev, session)
	case "cwmpDeviceConnectTest":
		go cwmpDeviceConnectTest(id, dev, session)
	case "cwmpGetParameterNames":
		go cwmpGetParameterNames(id, dev, session)
	case "cwmpGetRPCMethods":
		go cwmpGetRPCMethods(id, dev, session)
	case "cwmpDeviceBackup":
		go cwmpDeviceBackup(id, dev, session)
	case "cwmpDeviceUploadLog":
		go cwmpDeviceUploadLog(id, dev, session)
	case "cwmpOntOpticalInfo":
		go cwmpOntOpticalInfo(id, dev, session)
	case "cwmpOntWanInfo":
		go cwmpOntWanInfo(id, dev, session)
	case "cwmpWifiSsid":
		go cwmpWifiSsid(id, dev, session)
	}
	return c.JSON(200, web.RestSucc("The instruction has been sent, please check the execution log later, please do not execute it repeatedly in a short time"))

}

func connectDeviceAuth(session string, dev models.NetCpe) {
	if dev.CwmpUrl == "" {
		log.Infof("connectDeviceAuth: no CwmpUrl for sn=%s", dev.Sn)
		return
	}
	password := app.GApp().GetTr069SettingsStringValue("CpeConnectionRequestPassword")
	log.Infof("connectDeviceAuth: sending to %s user=%s", dev.CwmpUrl, dev.Sn)
	isok, err := cwmp.ConnectionRequestAuth(dev.Sn, password, dev.CwmpUrl)
	if err != nil {
		log.Infof("connectDeviceAuth: FAILED %s err=%s", dev.CwmpUrl, err.Error())
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("TR069 connect device %s failure %s", dev.CwmpUrl, err.Error()))
	}

	if isok {
		log.Infof("connectDeviceAuth: SUCCESS %s", dev.CwmpUrl)
		events.PubSuperviseLog(dev.ID, session, "info", fmt.Sprintf("TR069 connect device %s success", dev.CwmpUrl))
	} else if err == nil {
		log.Infof("connectDeviceAuth: REJECTED %s (not 200)", dev.CwmpUrl)
	}
}

func cwmpDeviceInfoUpdate(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.GetParameterValues{
			ID:     session,
			Name:   "",
			NoMore: 0,
			ParameterNames: []string{
				"Device.DeviceInfo.",
				"Device.ManagementServer.",
			},
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("TR069 Update device information push timeout %s", err.Error()))
		return
	}

	go connectDeviceAuth(session, dev)

}

func cwmpDeviceManagementAuthUpdate(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.UpdateManagementAuthInfo(session, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error", fmt.Sprintf("TR069 Update device management authentication information push timeout %s", err.Error()))
	} else {
		events.PubSuperviseStatus(dev.ID, session, fmt.Sprintf("TR069 The task of updating device management authentication information has been submitted， Please wait for the CPE connection to update"))
	}

}

func cwmpDeviceConnectTest(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.GetParameterValues{
			ID:     session,
			Name:   "test connection",
			NoMore: 0,
			ParameterNames: []string{
				"Device.DeviceInfo.",
			},
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("TR069 Update device message push timeout %s", err.Error()))
		return
	}

	go connectDeviceAuth(session, dev)

}

func cwmpGetParameterNames(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.GetParameterNames{
			ID:            session,
			Name:          "GetParameterNames",
			NoMore:        0,
			ParameterPath: "Device.",
			NextLevel:     "true",
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("CWMP Update device message push timeout %s", err.Error()))
		return
	}

	go connectDeviceAuth(session, dev)

}

func cwmpGetRPCMethods(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.GetRPCMethods{
			ID:     session,
			Name:   "GetRPCMethods",
			NoMore: 0,
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("CWMP GetRPCMethods message push timeout %s", err.Error()))
		return
	}

	go connectDeviceAuth(session, dev)

}

func cwmpDeviceUploadLog(sid string, dev models.NetCpe, session string) {
	var token = common.Md5Hash(session + app.GConfig().Tr069.Secret + time.Now().Format("20060102"))
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.Upload{
			ID:         session,
			Name:       "Cwmp logupload Task",
			NoMore:     0,
			CommandKey: session,
			FileType:   "2 Vendor Log File",
			URL: fmt.Sprintf("%s/cwmpupload/%s/%s/%s.log",
				app.GApp().GetTr069SettingsStringValue(app.ConfigTR069AccessAddress), session, token, dev.Sn+"_"+time.Now().Format("20060102")),
			Username:     "",
			Password:     "",
			DelaySeconds: 5,
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("CWMP Log upload message push timeout %s", err.Error()))
		return
	}

	go connectDeviceAuth(session, dev)

}

func cwmpDeviceBackup(sid string, dev models.NetCpe, session string) {
	var token = common.Md5Hash(session + app.GConfig().Tr069.Secret + time.Now().Format("20060102"))
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.Upload{
			ID:         session,
			Name:       "Cwmp Backup Task",
			NoMore:     0,
			CommandKey: session,
			FileType:   "1 Vendor Configuration File",
			URL: fmt.Sprintf("%s/cwmpupload/%s/%s/%s.rsc",
				app.GApp().GetTr069SettingsStringValue(app.ConfigTR069AccessAddress), session, token, dev.Sn+"_"+time.Now().Format("20060102")),
			Username:     "",
			Password:     "",
			DelaySeconds: 5,
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("CWMP Backup device message push timeout %s", err.Error()))
		return
	}

	go connectDeviceAuth(session, dev)

}

func cwmpDeviceReboot(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.Reboot{
			ID:         session,
			Name:       "Cwmp reboot Task",
			NoMore:     0,
			CommandKey: session,
		},
	}, 000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("Sending CWMP Reboot device information push timed out %s", err.Error()))
		return
	}

	go connectDeviceAuth(session, dev)

}

func cwmpDeviceFactoryReset(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.FactoryReset{
			ID:     session,
			Name:   "Cwmp FactoryReset Task",
			NoMore: 0,
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("Sending CWMP FactoryReset device information push timed out %s", err.Error()))
		return
	}

	go connectDeviceAuth(session, dev)

}

// getFactoryConfigFileTypeByManufacturer returns the factory config file type based on manufacturer
func getFactoryConfigFileTypeByManufacturer(manufacturer string) string {
	m := strings.ToLower(manufacturer)
	if strings.Contains(m, "mikrotik") {
		return "X MIKROTIK Factory Configuration File"
	}
	return "3 Vendor Configuration File"
}

// cwmpOntOpticalInfo retrieves ONT optical interface information
func cwmpOntOpticalInfo(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.GetParameterValues{
			ID:     session,
			Name:   "GetOntOpticalInfo",
			NoMore: 0,
			ParameterNames: []string{
				"Device.Optical.",
			},
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("TR069 Get ONT optical info timeout %s", err.Error()))
		return
	}
	go connectDeviceAuth(session, dev)
}

// cwmpOntWanInfo retrieves ONT WAN/network interface information
func cwmpOntWanInfo(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.GetParameterValues{
			ID:     session,
			Name:   "GetOntWanInfo",
			NoMore: 0,
			ParameterNames: []string{
				"Device.IP.",
				"Device.PPP.",
				"Device.Ethernet.",
			},
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("TR069 Get ONT WAN info timeout %s", err.Error()))
		return
	}
	go connectDeviceAuth(session, dev)
}

// cwmpWifiSsid retrieves WiFi SSID from the device
func cwmpWifiSsid(sid string, dev models.NetCpe, session string) {
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	// Try both TR-181 and TR-098 WiFi paths
	paramNames := []string{
		"Device.WiFi.",
		"InternetGatewayDevice.LANDevice.1.WLANConfiguration.",
	}
	err := cpe.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      dev.Sn,
		Message: &cwmp.GetParameterValues{
			ID:             session,
			Name:           "GetWifiSsid",
			NoMore:         0,
			ParameterNames: paramNames,
		},
	}, 5000, true)
	if err != nil {
		events.PubSuperviseLog(dev.ID, session, "error",
			fmt.Sprintf("TR069 Get WiFi SSID timeout %s", err.Error()))
		return
	}
	go connectDeviceAuth(session, dev)
}

// cwmpSetWifiParams creates separate CwmpPresetTasks for each param group
// and sends them directly to CPE via channel for immediate execution
func cwmpSetWifiParams(dev models.NetCpe, ssidIdx int, ssid, password, channel, enable string) error {
	prefix := fmt.Sprintf("InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.", ssidIdx)
	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	taskCount := 0

	// Task 1: SSID + Password
	ssidParams := make(map[string]cwmp.ValueStruct)
	if ssid != "" {
		ssidParams[prefix+"SSID"] = cwmp.ValueStruct{Type: "xsd:string", Value: ssid}
	}
	if password != "" {
		ssidParams[prefix+"KeyPassphrase"] = cwmp.ValueStruct{Type: "xsd:string", Value: password}
	}
	if len(ssidParams) > 0 {
		session := fmt.Sprintf("Wifi-SetWifiSSID-%s", common.UUID())
		msg := &cwmp.SetParameterValues{ID: session, NoMore: 0, Params: ssidParams}
		// Send directly to CPE channel for immediate execution
		err := cpe.SendCwmpEventData(models.CwmpEventData{
			Session: session,
			Sn:      dev.Sn,
			Message: msg,
		}, 5000, true)
		if err != nil {
			log.Errorf("Failed to send WiFi SSID task to channel: %s", err.Error())
		}
		// Also persist to DB for tracking
		if err := createWifiPresetTask(dev.Sn, "SetWifiSSID", "wifi-ssid", ssidParams, taskCount); err != nil {
			return err
		}
		taskCount++
	}

	// Task 2: Channel (separate — CPE rejects when combined with SSID)
	if channel != "" {
		chParams := make(map[string]cwmp.ValueStruct)
		chParams[prefix+"Channel"] = cwmp.ValueStruct{Type: "xsd:unsignedInt", Value: channel}
		if channel == "0" {
			chParams[prefix+"AutoChannelEnable"] = cwmp.ValueStruct{Type: "xsd:boolean", Value: "true"}
		} else {
			chParams[prefix+"AutoChannelEnable"] = cwmp.ValueStruct{Type: "xsd:boolean", Value: "false"}
		}
		session := fmt.Sprintf("Wifi-SetWifiChannel-%s", common.UUID())
		msg := &cwmp.SetParameterValues{ID: session, NoMore: 0, Params: chParams}
		// Send directly to CPE channel for immediate execution
		err := cpe.SendCwmpEventData(models.CwmpEventData{
			Session: session,
			Sn:      dev.Sn,
			Message: msg,
		}, 5000, true)
		if err != nil {
			log.Errorf("Failed to send WiFi Channel task to channel: %s", err.Error())
		}
		// Also persist to DB for tracking
		if err := createWifiPresetTask(dev.Sn, "SetWifiChannel", "wifi-channel", chParams, taskCount); err != nil {
			return err
		}
		taskCount++
	}

	// Task 3: Enable + BeaconType (separate — CPE rejects when combined)
	if enable == "true" || enable == "false" {
		enParams := make(map[string]cwmp.ValueStruct)
		enParams[prefix+"Enable"] = cwmp.ValueStruct{Type: "xsd:boolean", Value: enable}
		if enable == "true" {
			enParams[prefix+"BeaconType"] = cwmp.ValueStruct{Type: "xsd:string", Value: "WPAand11i"}
		}
		session := fmt.Sprintf("Wifi-SetWifiEnable-%s", common.UUID())
		msg := &cwmp.SetParameterValues{ID: session, NoMore: 0, Params: enParams}
		// Send directly to CPE channel for immediate execution
		err := cpe.SendCwmpEventData(models.CwmpEventData{
			Session: session,
			Sn:      dev.Sn,
			Message: msg,
		}, 5000, true)
		if err != nil {
			log.Errorf("Failed to send WiFi Enable task to channel: %s", err.Error())
		}
		// Also persist to DB for tracking
		if err := createWifiPresetTask(dev.Sn, "SetWifiEnable", "wifi-enable", enParams, taskCount); err != nil {
			return err
		}
		taskCount++
	}

	if taskCount == 0 {
		return fmt.Errorf("no params to set")
	}

	log.Infof("cwmpSetWifiParams: created %d tasks for sn=%s idx=%d, sent directly to CPE channel", taskCount, dev.Sn, ssidIdx)

	// Trigger CPE to connect and pick up the tasks if not already connected
	session := "WifiTrigger-" + common.UUID()
	go connectDeviceAuth(session, dev)

	return nil
}

func createWifiPresetTask(sn, name, event string, params map[string]cwmp.ValueStruct, order int) error {
	session := fmt.Sprintf("Wifi-%s-%s", name, common.UUID())
	msg := &cwmp.SetParameterValues{ID: session, NoMore: 0, Params: params}
	return app.GDB().Create(&models.CwmpPresetTask{
		ID: common.UUIDint64(), PresetId: 0, Event: event, Oid: "N/A",
		Name: name, Onfail: "ignore", Session: session, Sn: sn,
		Request: string(msg.CreateXML()), Status: "pending",
		ExecTime:  time.Now(),
		CreatedAt: time.Now().Add(time.Duration(order) * time.Second),
		UpdatedAt: time.Now(),
	}).Error
}

// cwmpSetWanParams creates preset tasks to set WAN connection parameters
// and sends them directly to CPE via channel for immediate execution
func cwmpSetWanParams(dev models.NetCpe, devIdx, connIdx int, connType, username, password, enable, ipMode, vlanID string) error {
	// Build TR-069 parameter prefix
	var connPath string
	if connType == "PPPoE" {
		connPath = fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%d.WANPPPConnection.%d.", devIdx, connIdx)
	} else {
		connPath = fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%d.WANIPConnection.%d.", devIdx, connIdx)
	}
	devPath := fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%d.", devIdx)

	cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
	taskCount := 0

	// Task 1: Username + Password (PPPoE only)
	if connType == "PPPoE" && (username != "" || password != "") {
		authParams := make(map[string]cwmp.ValueStruct)
		if username != "" {
			authParams[connPath+"Username"] = cwmp.ValueStruct{Type: "xsd:string", Value: username}
		}
		if password != "" {
			authParams[connPath+"Password"] = cwmp.ValueStruct{Type: "xsd:string", Value: password}
		}
		session := fmt.Sprintf("Wan-SetWanAuth-%s", common.UUID())
		msg := &cwmp.SetParameterValues{ID: session, NoMore: 0, Params: authParams}
		// Send directly to CPE channel for immediate execution
		err := cpe.SendCwmpEventData(models.CwmpEventData{
			Session: session,
			Sn:      dev.Sn,
			Message: msg,
		}, 5000, true)
		if err != nil {
			log.Errorf("Failed to send WAN Auth task to channel: %s", err.Error())
		}
		// Also persist to DB for tracking
		if err := createWifiPresetTask(dev.Sn, "SetWanAuth", "wan-auth", authParams, taskCount); err != nil {
			return err
		}
		taskCount++
	}

	// Task 2: VLAN ID
	if vlanID != "" {
		vlanParams := make(map[string]cwmp.ValueStruct)
		// Set VLAN at device level (GponLinkConfig)
		vlanParams[devPath+"X_CT-COM_WANGponLinkConfig.VLANIDMark"] = cwmp.ValueStruct{Type: "xsd:unsignedInt", Value: vlanID}
		// Also set at connection level
		vlanParams[connPath+"X_CT-COM_VLANIDMark"] = cwmp.ValueStruct{Type: "xsd:unsignedInt", Value: vlanID}
		session := fmt.Sprintf("Wan-SetWanVLAN-%s", common.UUID())
		msg := &cwmp.SetParameterValues{ID: session, NoMore: 0, Params: vlanParams}
		// Send directly to CPE channel for immediate execution
		err := cpe.SendCwmpEventData(models.CwmpEventData{
			Session: session,
			Sn:      dev.Sn,
			Message: msg,
		}, 5000, true)
		if err != nil {
			log.Errorf("Failed to send WAN VLAN task to channel: %s", err.Error())
		}
		// Also persist to DB for tracking
		if err := createWifiPresetTask(dev.Sn, "SetWanVLAN", "wan-vlan", vlanParams, taskCount); err != nil {
			return err
		}
		taskCount++
	}

	// Task 3: IP Mode
	if ipMode != "" {
		ipParams := make(map[string]cwmp.ValueStruct)
		ipParams[connPath+"X_CT-COM_IPMode"] = cwmp.ValueStruct{Type: "xsd:unsignedInt", Value: ipMode}
		session := fmt.Sprintf("Wan-SetWanIPMode-%s", common.UUID())
		msg := &cwmp.SetParameterValues{ID: session, NoMore: 0, Params: ipParams}
		// Send directly to CPE channel for immediate execution
		err := cpe.SendCwmpEventData(models.CwmpEventData{
			Session: session,
			Sn:      dev.Sn,
			Message: msg,
		}, 5000, true)
		if err != nil {
			log.Errorf("Failed to send WAN IPMode task to channel: %s", err.Error())
		}
		// Also persist to DB for tracking
		if err := createWifiPresetTask(dev.Sn, "SetWanIPMode", "wan-ipmode", ipParams, taskCount); err != nil {
			return err
		}
		taskCount++
	}

	// Task 4: Enable/Disable
	if enable == "true" || enable == "false" {
		enParams := make(map[string]cwmp.ValueStruct)
		enParams[connPath+"Enable"] = cwmp.ValueStruct{Type: "xsd:boolean", Value: enable}
		session := fmt.Sprintf("Wan-SetWanEnable-%s", common.UUID())
		msg := &cwmp.SetParameterValues{ID: session, NoMore: 0, Params: enParams}
		// Send directly to CPE channel for immediate execution
		err := cpe.SendCwmpEventData(models.CwmpEventData{
			Session: session,
			Sn:      dev.Sn,
			Message: msg,
		}, 5000, true)
		if err != nil {
			log.Errorf("Failed to send WAN Enable task to channel: %s", err.Error())
		}
		// Also persist to DB for tracking
		if err := createWifiPresetTask(dev.Sn, "SetWanEnable", "wan-enable", enParams, taskCount); err != nil {
			return err
		}
		taskCount++
	}

	if taskCount == 0 {
		return fmt.Errorf("no WAN params to set")
	}

	log.Infof("cwmpSetWanParams: created %d tasks for sn=%s dev=%d conn=%d type=%s, sent directly to CPE channel", taskCount, dev.Sn, devIdx, connIdx, connType)

	session := "WanTrigger-" + common.UUID()
	go connectDeviceAuth(session, dev)

	return nil
}
