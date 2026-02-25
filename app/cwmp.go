package app

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/ca17/teamsacs/assets"
	"github.com/ca17/teamsacs/common"
	"github.com/ca17/teamsacs/common/cwmp"
	"github.com/ca17/teamsacs/common/timeutil"
	"github.com/ca17/teamsacs/common/web"
	"github.com/ca17/teamsacs/common/zaplog/log"
	"github.com/ca17/teamsacs/models"
)

type CwmpEventTable struct {
	cpeTable map[string]*CwmpCpe
	cpeLock  sync.Mutex
}

type CwmpCpe struct {
	Sn              string `json:"sn"`
	OUI             string `json:"oui"`
	taskTags        []string
	SoftwareVersion string `json:"software_version"`
	Manufacturer    string `json:"manufacturer"`
	ProductClass    string `json:"product_class"`
	cwmpQueueMap    chan models.CwmpEventData
	cwmpHPQueueMap  chan models.CwmpEventData
	LastInform      *cwmp.Inform `json:"latest_message"`
	LastUpdate      time.Time    `json:"last_update"`
	LastDataNotify  time.Time    `json:"last_data_notify"`
	IsRegister      bool         `json:"is_register"`
}

func NewCwmpEventTable() *CwmpEventTable {
	et := &CwmpEventTable{
		cpeTable: make(map[string]*CwmpCpe),
		cpeLock:  sync.Mutex{},
	}
	return et
}

func (c *CwmpEventTable) Size() int {
	c.cpeLock.Lock()
	defer c.cpeLock.Unlock()
	return len(c.cpeTable)
}

func (c *CwmpEventTable) ListSn() []string {
	c.cpeLock.Lock()
	defer c.cpeLock.Unlock()
	var snlist = make([]string, 0)
	for s, _ := range c.cpeTable {
		snlist = append(snlist, s)
	}
	return snlist
}

func (c *CwmpEventTable) GetCwmpCpe(key string) *CwmpCpe {
	if common.IsEmptyOrNA(key) {
		panic(errors.New("key is empty"))
	}
	c.cpeLock.Lock()
	defer c.cpeLock.Unlock()
	cpe, ok := c.cpeTable[key]
	if !ok {
		var count int64 = 0
		app.gormDB.Model(models.NetCpe{}).Where("sn=?", key).Count(&count)
		cpe = &CwmpCpe{
			Sn:             key,
			LastUpdate:     timeutil.EmptyTime,
			LastDataNotify: timeutil.EmptyTime,
			cwmpQueueMap:   make(chan models.CwmpEventData, 512),
			cwmpHPQueueMap: make(chan models.CwmpEventData, 1),
			LastInform:     nil,
			IsRegister:     count > 0,
		}
		c.cpeTable[key] = cpe
	}
	return cpe
}

func (c *CwmpEventTable) ClearCwmpCpe(key string) {
	c.cpeLock.Lock()
	defer c.cpeLock.Unlock()
	delete(c.cpeTable, key)
}

func (c *CwmpEventTable) ClearCwmpCpeCache(key string) {
	cpe := c.GetCwmpCpe(key)
	cpe.taskTags = nil
}

func (c *CwmpEventTable) UpdateCwmpCpe(key string, msg *cwmp.Inform) {
	cpe := c.GetCwmpCpe(key)
	cpe.UpdateStatus(msg)
}

func (c *CwmpCpe) UpdateStatus(msg *cwmp.Inform) {
	c.LastInform = msg
	c.LastUpdate = time.Now()
	if msg.ProductClass != "" {
		c.ProductClass = msg.ProductClass
	}
	if msg.OUI != "" {
		c.OUI = msg.OUI
	}
	if msg.Manufacturer != "" {
		c.Manufacturer = msg.Manufacturer
	}
	if msg.GetSoftwareVersion() != "" {
		c.SoftwareVersion = msg.GetSoftwareVersion()
	}
}

func (c *CwmpCpe) NotifyDataUpdate(force bool) {
	var ctime = time.Now()
	updateFlag := ctime.Sub(c.LastDataNotify).Seconds() > 300
	if force {
		updateFlag = true
	}
	if updateFlag {
		// events.Bus.Publish(events.EventCwmpInformUpdate, c.Sn, c.LastInform)
		c.OnInformUpdate()
		c.LastDataNotify = time.Now()
		// log.Infof("CPE %s OnInformUpdate", c.Sn)
	} else {
		// events.Bus.Publish(events.EventCwmpInformUpdateOnline, c.Sn)
		c.OnInformUpdateOnline()
		// log.Infof("CPE %s OnInformUpdateOnline", c.Sn)
	}
}

func (c *CwmpCpe) getQueue(hp bool) chan models.CwmpEventData {
	var que = c.cwmpQueueMap
	if hp {
		que = c.cwmpHPQueueMap
	}
	return que
}

func (c *CwmpCpe) TaskTags() (tags []string) {
	if c.taskTags != nil {
		return c.taskTags
	}
	var _tags string
	app.gormDB.Raw("select task_tags from net_cpe where sn = ? ", c.Sn).Scan(&_tags)
	_tags2 := strings.Split(strings.TrimSpace(_tags), ",")
	for _, tag := range _tags2 {
		if tag != "" {
			tags = append(tags, tag)
		}
	}
	if len(tags) > 0 {
		c.taskTags = tags
	}
	return
}

func setMapValue(vmap map[string]interface{}, name string, value interface{}) {
	if name != "" && value != "" {
		vmap[name] = value
	}
}

// RecvCwmpEventData 接收一个 Cwmp 事件
func (c *CwmpCpe) RecvCwmpEventData(timeoutMsec int, hp bool) (data *models.CwmpEventData, err error) {
	select {
	case _data := <-c.getQueue(hp):
		return &_data, nil
	case <-time.After(time.Millisecond * time.Duration(timeoutMsec)):
		return nil, errors.New("read cwmp event channel timeout")
	}
}

// GetCwmpPresetEventData 获取一个 Cwmp 预设任务执行
func (c *CwmpCpe) GetCwmpPresetEventData() (data *models.CwmpEventData, err error) {

	return nil, err
}

// SendCwmpEventData 发送一个 Cwmp 事件，
func (c *CwmpCpe) SendCwmpEventData(data models.CwmpEventData, timeoutMsec int, hp bool) error {
	select {
	case c.getQueue(hp) <- data:
		return nil
	case <-time.After(time.Millisecond * time.Duration(timeoutMsec)):
		return errors.New("cwmp event channel full, write timeout")
	}
}

// CheckRegister 检查设备注册情况
// detectDeviceType identifies device type from Inform manufacturer/productClass
// detectDeviceType identifies device type from Inform manufacturer/productClass
func detectDeviceType(manufacturer, productClass, oui string) string {
	m := strings.ToLower(manufacturer)
	p := strings.ToLower(productClass)
	switch {
	case strings.Contains(m, "zte"):
		return DeviceTypeONT
	case strings.Contains(m, "huawei") && (strings.Contains(p, "ont") || strings.Contains(p, "hg") || strings.Contains(p, "eg")):
		return DeviceTypeONT
	case strings.Contains(m, "fiberhome") || strings.Contains(m, "an5506"):
		return DeviceTypeONT
	case strings.Contains(m, "nokia") || strings.Contains(m, "alcatel"):
		return DeviceTypeONT
	case strings.Contains(m, "bdcom"):
		return DeviceTypeONT
	case strings.Contains(m, "cdtc"):
		return DeviceTypeONT
	case strings.Contains(p, "ont") || strings.Contains(p, "onu") || strings.Contains(p, "gpon") || strings.Contains(p, "epon"):
		return DeviceTypeONT
	case strings.Contains(m, "mikrotik"):
		return DeviceTypeRouter
	default:
		return DeviceTypeRouter
	}
}

func (c *CwmpCpe) CheckRegister(ip string, msg *cwmp.Inform) {
	if app.GetTr069SettingsStringValue(ConfigCpeAutoRegister) != "enabled" {
		return
	}
	if !c.IsRegister {
		var ctime = time.Now()
		deviceType := detectDeviceType(msg.Manufacturer, msg.ProductClass, msg.OUI)
		err := app.gormDB.Create(&models.NetCpe{
			ID:           common.UUIDint64(),
			NodeId:       AutoRegisterPopNodeId,
			Sn:           msg.Sn,
			Name:         "Device-" + msg.Sn,
			Model:        msg.ProductClass,
			Oui:          msg.OUI,
			Manufacturer: msg.Manufacturer,
			ProductClass: msg.ProductClass,
			DeviceType:   deviceType,
			Status:       "",
			Remark:       "first register from " + ip,
			CwmpUrl:      msg.GetParam("Device.ManagementServer.ConnectionRequestURL"),
			CreatedAt:    ctime,
			UpdatedAt:    ctime,
		}).Error
		if err == nil {
			log.Info("Auto register new device: %s (type: %s)", msg.Sn, deviceType)
			c.IsRegister = true
		} else {
			log.Errorf("CheckRegister create cpe error: %s", err)
		}
	}
}

func (c *CwmpCpe) UpdateManagementAuthInfo(session string, timeout int, hp bool) error {
	// Detect data model from LastInform parameters
	prefix := "Device.ManagementServer."
	if c.LastInform != nil {
		for paramName := range c.LastInform.Params {
			if strings.HasPrefix(paramName, "InternetGatewayDevice.") {
				prefix = "InternetGatewayDevice.ManagementServer."
				break
			}
		}
	}

	params := map[string]cwmp.ValueStruct{
		prefix + "ConnectionRequestUsername": {
			Type:  "xsd:string",
			Value: c.Sn,
		},
		prefix + "ConnectionRequestPassword": {
			Type:  "xsd:string",
			Value: app.GetTr069SettingsStringValue("CpeConnectionRequestPassword"),
		},
		prefix + "PeriodicInformEnable": {
			Type:  "xsd:boolean",
			Value: "true",
		},
		prefix + "PeriodicInformInterval": {
			Type: "xsd:unsignedInt",
			Value: func() string {
				v := app.GetTr069SettingsStringValue("CpePeriodicInformInterval")
				if v == "" {
					return "60"
				}
				return v
			}(),
		},
	}

	return c.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      c.Sn,
		Message: &cwmp.SetParameterValues{
			ID:     session,
			Name:   "",
			NoMore: 0,
			Params: params,
		},
	}, timeout, hp)
}

// PushPeriodicInform pushes periodic inform settings to the device
func (c *CwmpCpe) PushPeriodicInform(session string, timeout int, hp bool) error {
	prefix := "Device.ManagementServer."
	if c.LastInform != nil {
		for paramName := range c.LastInform.Params {
			if strings.HasPrefix(paramName, "InternetGatewayDevice.") {
				prefix = "InternetGatewayDevice.ManagementServer."
				break
			}
		}
	}

	interval := app.GetTr069SettingsStringValue("CpePeriodicInformInterval")
	if interval == "" {
		interval = "60"
	}

	params := map[string]cwmp.ValueStruct{
		prefix + "PeriodicInformEnable": {
			Type:  "xsd:boolean",
			Value: "true",
		},
		prefix + "PeriodicInformInterval": {
			Type:  "xsd:unsignedInt",
			Value: interval,
		},
	}

	return c.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      c.Sn,
		Message: &cwmp.SetParameterValues{
			ID:     session,
			Name:   "",
			NoMore: 0,
			Params: params,
		},
	}, timeout, hp)
}

// PushWebCredentials pushes ONT web admin and user credentials to the device
// Uses vendor-specific TR-069 parameter paths based on device manufacturer
func (c *CwmpCpe) PushWebCredentials(session string, timeout int, hp bool) error {
	adminUser := app.GetTr069SettingsStringValue(ConfigOntWebAdminUsername)
	adminPass := app.GetTr069SettingsStringValue(ConfigOntWebAdminPassword)
	userUser := app.GetTr069SettingsStringValue(ConfigOntWebUserUsername)
	userPass := app.GetTr069SettingsStringValue(ConfigOntWebUserPassword)

	if adminUser == "" && adminPass == "" && userUser == "" && userPass == "" {
		return nil
	}

	params := make(map[string]cwmp.ValueStruct)
	m := strings.ToLower(c.Manufacturer)

	// Determine vendor-specific paths — only use paths known to work per vendor
	switch {
	case strings.Contains(m, "zte"):
		// ZTE only supports X_ZTE-COM_UserInterface paths
		if adminPass != "" {
			params["InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.AdminPassword"] = cwmp.ValueStruct{Type: "xsd:string", Value: adminPass}
		}
		if userUser != "" {
			params["InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.UserName"] = cwmp.ValueStruct{Type: "xsd:string", Value: userUser}
		}
		if userPass != "" {
			params["InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.UserPassword"] = cwmp.ValueStruct{Type: "xsd:string", Value: userPass}
		}
	default:
		// CDATA/CDTC and other TR-098 devices — use X_CT-COM_TeleComAccount
		if adminUser != "" {
			params["InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.Username"] = cwmp.ValueStruct{Type: "xsd:string", Value: adminUser}
		}
		if adminPass != "" {
			params["InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.Password"] = cwmp.ValueStruct{Type: "xsd:string", Value: adminPass}
		}
	}

	if len(params) == 0 {
		return nil
	}

	return c.SendCwmpEventData(models.CwmpEventData{
		Session: session,
		Sn:      c.Sn,
		Message: &cwmp.SetParameterValues{
			ID:     session,
			Name:   "",
			NoMore: 0,
			Params: params,
		},
	}, timeout, hp)
}

func (c *CwmpCpe) ProcessParameterNamesResponse(msg *cwmp.GetParameterNamesResponse) {
	for _, param := range msg.Params {
		if param.Writable == "" {
			continue
		}
		app.gormDB.Model(&models.NetCpeParam{}).
			Where("sn = ? and name = ?", c.Sn, param.Name).
			Update("writable", param.Writable)
	}
}

// getInformParam gets a parameter value from Inform, trying TR-181 path first, then TR-098 path
func getInformParam(msg *cwmp.Inform, tr181Path, tr098Path string) string {
	v := msg.GetParam(tr181Path)
	if v == "" && tr098Path != "" {
		v = msg.GetParam(tr098Path)
	}
	return v
}

// parseWifiSsids extracts WiFi SSIDs, passwords, and enable status from parameters map
// Returns JSON string: [{"ssid":"name","password":"pass","enable":"true"}, ...]
func parseWifiSsids(params map[string]string) string {
	type wifiEntry struct {
		Idx      int    `json:"idx"`
		SSID     string `json:"ssid"`
		Password string `json:"password"`
		Enable   string `json:"enable"`
		Channel  string `json:"channel,omitempty"`
	}
	entries := make(map[int]*wifiEntry)

	// TR-098 prefix
	const tr098Prefix = "InternetGatewayDevice.LANDevice.1.WLANConfiguration."
	// TR-181 prefixes
	const tr181SsidPrefix = "Device.WiFi.SSID."
	const tr181ApPrefix = "Device.WiFi.AccessPoint."

	for name, value := range params {
		// TR-098: InternetGatewayDevice.LANDevice.1.WLANConfiguration.N.XXX
		if strings.HasPrefix(name, tr098Prefix) {
			rest := name[len(tr098Prefix):] // e.g. "1.SSID" or "1.KeyPassphrase" or "1.Enable"
			parts := strings.SplitN(rest, ".", 2)
			if len(parts) != 2 {
				continue
			}
			idx, err := strconv.Atoi(parts[0])
			if err != nil {
				continue
			}
			field := parts[1]
			if _, ok := entries[idx]; !ok {
				entries[idx] = &wifiEntry{}
			}
			switch field {
			case "SSID":
				entries[idx].SSID = value
			case "KeyPassphrase":
				entries[idx].Password = value
			case "Enable":
				entries[idx].Enable = value
			case "PreSharedKey.1.KeyPassphrase":
				if entries[idx].Password == "" {
					entries[idx].Password = value
				}
			case "Channel":
				entries[idx].Channel = value
			case "ChannelsInUse":
				if entries[idx].Channel == "" || entries[idx].Channel == "0" {
					entries[idx].Channel = value
				}
			}
		}
		// TR-181: Device.WiFi.SSID.N.XXX
		if strings.HasPrefix(name, tr181SsidPrefix) {
			rest := name[len(tr181SsidPrefix):]
			parts := strings.SplitN(rest, ".", 2)
			if len(parts) != 2 {
				continue
			}
			idx, err := strconv.Atoi(parts[0])
			if err != nil {
				continue
			}
			field := parts[1]
			if _, ok := entries[idx]; !ok {
				entries[idx] = &wifiEntry{}
			}
			switch field {
			case "SSID":
				entries[idx].SSID = value
			case "Enable":
				entries[idx].Enable = value
			}
		}
		// TR-181: Device.WiFi.AccessPoint.N.Security.KeyPassphrase
		if strings.HasPrefix(name, tr181ApPrefix) {
			rest := name[len(tr181ApPrefix):]
			parts := strings.SplitN(rest, ".", 2)
			if len(parts) != 2 {
				continue
			}
			idx, err := strconv.Atoi(parts[0])
			if err != nil {
				continue
			}
			if parts[1] == "Security.KeyPassphrase" {
				if _, ok := entries[idx]; !ok {
					entries[idx] = &wifiEntry{}
				}
				entries[idx].Password = value
			}
		}
	}

	if len(entries) == 0 {
		return ""
	}

	// Sort by index and build list
	var result []wifiEntry
	for i := 1; i <= 16; i++ {
		if e, ok := entries[i]; ok && e.SSID != "" {
			e.Idx = i
			result = append(result, *e)
		}
	}
	if len(result) == 0 {
		return ""
	}
	data, _ := json.Marshal(result)
	return string(data)
}

// parseWanConnections extracts WAN connection info from parameters map
// Returns JSON string: [{"name":"...","service":"INTERNET","ip":"...","username":"...","type":"PPPoE","enable":"true"}, ...]
func parseWanConnections(params map[string]string) string {
	type wanEntry struct {
		Name       string `json:"name"`
		Service    string `json:"service"`
		IP         string `json:"ip"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		ConnType   string `json:"type"`
		Enable     string `json:"enable"`
		VlanID     string `json:"vlan_id"`
		IPv6Status string `json:"ipv6_status"`
		IPv6IP     string `json:"ipv6_ip"`
		IPMode     string `json:"ip_mode"`
		DevIdx     string `json:"dev_idx"`
		ConnIdx    string `json:"conn_idx"`
	}
	// Use composite key "devIdx-connIdx" to handle multiple WANConnectionDevices
	entries := make(map[string]*wanEntry)
	var keys []string // preserve order

	const wanPrefix = "InternetGatewayDevice.WANDevice.1.WANConnectionDevice."

	for name, value := range params {
		if !strings.HasPrefix(name, wanPrefix) {
			continue
		}
		rest := name[len(wanPrefix):] // e.g. "1.WANPPPConnection.1.Name"
		parts := strings.SplitN(rest, ".", 2)
		if len(parts) != 2 {
			continue
		}
		devIdx := parts[0] // "1" or "2"
		remaining := parts[1]

		var connType, connIdx, field string
		// WANPPPConnection.N.Field
		if strings.HasPrefix(remaining, "WANPPPConnection.") {
			connType = "PPPoE"
			sub := remaining[len("WANPPPConnection."):]
			p := strings.SplitN(sub, ".", 2)
			if len(p) != 2 {
				continue
			}
			connIdx = p[0]
			field = p[1]
		} else if strings.HasPrefix(remaining, "WANIPConnection.") {
			connType = "IPoE"
			sub := remaining[len("WANIPConnection."):]
			p := strings.SplitN(sub, ".", 2)
			if len(p) != 2 {
				continue
			}
			connIdx = p[0]
			field = p[1]
		} else {
			continue
		}

		key := devIdx + "-" + connIdx + "-" + connType
		if _, ok := entries[key]; !ok {
			entries[key] = &wanEntry{ConnType: connType, DevIdx: devIdx, ConnIdx: connIdx}
			keys = append(keys, key)
		}
		e := entries[key]
		switch field {
		case "Name":
			e.Name = value
		case "X_CT-COM_ServiceList", "X_HW_SERVICELIST", "X_ZTE-COM_ServiceList", "X_CMCC_ServiceList", "ServiceList", "X_FH_ServiceList", "X_CU_ServiceList":
			if value != "" && e.Service == "" {
				e.Service = value
			}
		case "ExternalIPAddress":
			e.IP = value
		case "Username":
			e.Username = value
		case "ConnectionType":
			if value == "IP_Routed" {
				// keep connType as PPPoE/IPoE
			} else if value == "PPPoE_Bridged" || value == "IP_Bridged" {
				e.ConnType = "Bridge"
			}
		case "Enable":
			e.Enable = value
		case "Password":
			e.Password = value
		case "X_ZTE-COM_VLANID", "X_HW_VLAN", "X_CT-COM_VLANIDMark", "X_CMCC_VLANIDMark", "VLANID", "VLAN_ID", "X_CT-COM_VLAN":
			if value != "" && e.VlanID == "" {
				e.VlanID = value
			}
		case "X_CT-COM_IPv6ConnStatus":
			e.IPv6Status = value
		case "X_CT-COM_IPv6IPAddress":
			e.IPv6IP = value
		case "X_CT-COM_IPMode":
			switch value {
			case "1":
				e.IPMode = "IPv4"
			case "2":
				e.IPMode = "IPv6"
			case "3":
				e.IPMode = "Dual Stack"
			default:
				e.IPMode = value
			}
		}
	}

	// Second pass: pick up WANConnectionDevice-level VLAN for CDTC/CT-COM devices
	// e.g. WANConnectionDevice.1.X_CT-COM_WANGponLinkConfig.VLANIDMark = "220"
	for name, value := range params {
		if !strings.HasPrefix(name, wanPrefix) || value == "" {
			continue
		}
		rest := name[len(wanPrefix):]
		parts := strings.SplitN(rest, ".", 2)
		if len(parts) != 2 {
			continue
		}
		devIdx := parts[0]
		field := parts[1]
		if field == "X_CT-COM_WANGponLinkConfig.VLANIDMark" || field == "X_CT-COM_WANEponLinkConfig.VLANIDMark" {
			// Find any connection entry for this devIdx and fill VLAN if empty
			for k, e := range entries {
				if strings.HasPrefix(k, devIdx+"-") && e.VlanID == "" {
					e.VlanID = value
				}
			}
		}
	}

	if len(entries) == 0 {
		return ""
	}

	// Build sorted result
	var result []wanEntry
	// Sort keys naturally
	sort.Strings(keys)
	for _, k := range keys {
		e := entries[k]
		if e.Name != "" || e.IP != "" || e.Service != "" {
			// If IPMode not set from X_CT-COM_IPMode, derive from connection status
			if e.IPMode == "" {
				hasIPv4 := e.IP != "" && e.IP != "0.0.0.0"
				hasIPv6 := e.IPv6Status == "Connected" || (e.IPv6IP != "" && e.IPv6IP != "::")
				if hasIPv4 && hasIPv6 {
					e.IPMode = "Dual Stack"
				} else if hasIPv6 {
					e.IPMode = "IPv6"
				} else if hasIPv4 {
					e.IPMode = "IPv4"
				} else {
					e.IPMode = "-"
				}
			}
			result = append(result, *e)
		}
	}
	if len(result) == 0 {
		return ""
	}
	data, _ := json.Marshal(result)
	return string(data)
}

// parseHostDevices extracts connected LAN/WiFi devices from parameters map
// Merges Hosts.Host (all devices) with WLANConfiguration.AssociatedDevice (WiFi RSSI)
// Returns JSON string: [{"hostname":"...","ip":"...","mac":"...","interface":"802.11","rssi":"-72","ssid":"1"}, ...]
func parseHostDevices(params map[string]string) string {
	type hostEntry struct {
		Hostname  string `json:"hostname"`
		IP        string `json:"ip"`
		MAC       string `json:"mac"`
		Interface string `json:"interface"`
		RSSI      string `json:"rssi,omitempty"`
		SSID      string `json:"ssid,omitempty"`
	}
	entries := make(map[int]*hostEntry)

	// WiFi AssociatedDevice data keyed by MAC (lowercase) for merging
	type wifiInfo struct {
		RSSI     string
		Hostname string
		SSID     string
	}
	wifiByMAC := make(map[string]*wifiInfo)

	const hostsPrefix = "InternetGatewayDevice.LANDevice.1.Hosts.Host."
	const wlanPrefix = "InternetGatewayDevice.LANDevice.1.WLANConfiguration."

	for name, value := range params {
		// Parse Hosts.Host.N.Field
		if strings.HasPrefix(name, hostsPrefix) {
			rest := name[len(hostsPrefix):]
			parts := strings.SplitN(rest, ".", 2)
			if len(parts) != 2 {
				continue
			}
			idx, err := strconv.Atoi(parts[0])
			if err != nil {
				continue
			}
			if _, ok := entries[idx]; !ok {
				entries[idx] = &hostEntry{}
			}
			switch parts[1] {
			case "HostName":
				entries[idx].Hostname = value
			case "IPAddress":
				entries[idx].IP = value
			case "MACAddress":
				entries[idx].MAC = value
			case "InterfaceType":
				entries[idx].Interface = value
			}
			continue
		}

		// Parse WLANConfiguration.N.AssociatedDevice.M.Field
		if strings.HasPrefix(name, wlanPrefix) {
			rest := name[len(wlanPrefix):]
			// rest = "1.AssociatedDevice.1.AssociatedDeviceRssi"
			p1 := strings.SplitN(rest, ".", 2)
			if len(p1) != 2 {
				continue
			}
			ssidIdx := p1[0]
			if !strings.HasPrefix(p1[1], "AssociatedDevice.") {
				continue
			}
			adRest := p1[1][len("AssociatedDevice."):]
			p2 := strings.SplitN(adRest, ".", 2)
			if len(p2) != 2 {
				continue
			}
			devKey := ssidIdx + "-" + p2[0] // "1-1"
			field := p2[1]

			if _, ok := wifiByMAC[devKey]; !ok {
				wifiByMAC[devKey] = &wifiInfo{SSID: ssidIdx}
			}
			wi := wifiByMAC[devKey]
			switch field {
			case "AssociatedDeviceMACAddress":
				// Re-key by MAC after we collect all data
				wi.SSID = ssidIdx
			case "AssociatedDeviceRssi", "X_HW_RSSI", "SignalStrength", "X_ZTE-COM_Rssi":
				if value != "" && wi.RSSI == "" {
					wi.RSSI = value
				}
			case "X_ZTE-COM_AssociatedDeviceName", "X_HW_AssociatedDevicedescriptions":
				if value != "" {
					wi.Hostname = value
				}
			}
		}
	}

	// Build MAC -> wifiInfo lookup from AssociatedDevice data
	macToWifi := make(map[string]*wifiInfo)
	for devKey, wi := range wifiByMAC {
		// Find MAC for this devKey
		parts := strings.SplitN(devKey, "-", 2)
		if len(parts) != 2 {
			continue
		}
		macParam := wlanPrefix + parts[0] + ".AssociatedDevice." + parts[1] + ".AssociatedDeviceMACAddress"
		if mac, ok := params[macParam]; ok && mac != "" {
			macToWifi[strings.ToLower(mac)] = wi
		}
	}

	if len(entries) == 0 {
		// Fallback: if no Hosts.Host entries, build from AssociatedDevice data directly
		if len(macToWifi) == 0 {
			return ""
		}
		var result []hostEntry
		// Sort keys for consistent ordering
		var macKeys []string
		for mac := range macToWifi {
			macKeys = append(macKeys, mac)
		}
		sort.Strings(macKeys)
		for _, mac := range macKeys {
			wi := macToWifi[mac]
			// Find IP from AssociatedDevice params
			ip := ""
			for devKey := range wifiByMAC {
				parts := strings.SplitN(devKey, "-", 2)
				if len(parts) != 2 {
					continue
				}
				macParam := wlanPrefix + parts[0] + ".AssociatedDevice." + parts[1] + ".AssociatedDeviceMACAddress"
				if m, ok := params[macParam]; ok && strings.ToLower(m) == mac {
					ipParam := wlanPrefix + parts[0] + ".AssociatedDevice." + parts[1] + ".AssociatedDeviceIPAddress"
					if v, ok := params[ipParam]; ok {
						ip = v
					}
					break
				}
			}
			result = append(result, hostEntry{
				Hostname:  wi.Hostname,
				IP:        ip,
				MAC:       mac,
				Interface: "802.11",
				RSSI:      wi.RSSI,
				SSID:      wi.SSID,
			})
		}
		if len(result) == 0 {
			return ""
		}
		data, _ := json.Marshal(result)
		return string(data)
	}

	// Merge: enrich Hosts.Host entries with WiFi RSSI data
	var result []hostEntry
	for i := 1; i <= 64; i++ {
		e, ok := entries[i]
		if !ok || (e.IP == "" && e.MAC == "") {
			continue
		}
		// Try to find RSSI data by MAC match
		if e.MAC != "" {
			if wi, ok := macToWifi[strings.ToLower(e.MAC)]; ok {
				e.RSSI = wi.RSSI
				e.SSID = wi.SSID
				if e.Hostname == "" && wi.Hostname != "" {
					e.Hostname = wi.Hostname
				}
			}
		}
		result = append(result, *e)
	}
	if len(result) == 0 {
		return ""
	}
	data, _ := json.Marshal(result)
	return string(data)
}

// applyVendorSpecificParams extracts vendor-specific parameters from an Inform message
func (c *CwmpCpe) applyVendorSpecificParams(valmap map[string]interface{}, msg *cwmp.Inform) {
	m := strings.ToLower(c.Manufacturer)
	switch {
	case strings.Contains(m, "mikrotik"):
		// Mikrotik-specific parameters
		setMapValue(valmap, "arch_name", msg.GetParam("Device.DeviceInfo.X_MIKROTIK_ArchName"))
		setMapValue(valmap, "system_name", msg.GetParam("Device.DeviceInfo.X_MIKROTIK_SystemIdentity"))
	default:
		// ONT / generic parameters — try TR-181 then TR-098 paths
		setMapValue(valmap, "system_name", getInformParam(msg,
			"Device.DeviceInfo.ModelName",
			"InternetGatewayDevice.DeviceInfo.ModelName"))
		// Optical signal parameters — TR-181 (Device.Optical) or TR-098 (XponInterface)
		rxPower := getInformParam(msg,
			"Device.Optical.Interface.1.RxPower",
			"InternetGatewayDevice.DeviceInfo.XponInterface.RXPower")
		setMapValue(valmap, "fiber_rx_power", rxPower)
		txPower := getInformParam(msg,
			"Device.Optical.Interface.1.TxPower",
			"InternetGatewayDevice.DeviceInfo.XponInterface.TXPower")
		setMapValue(valmap, "fiber_tx_power", txPower)
		setMapValue(valmap, "pon_sn_hex", getInformParam(msg,
			"Device.DeviceInfo.SerialNumber",
			"InternetGatewayDevice.DeviceInfo.SerialNumber"))
		setMapValue(valmap, "olt_uplink", getInformParam(msg,
			"Device.Optical.Interface.1.UpperLayers",
			"InternetGatewayDevice.DeviceInfo.XponInterface.OLTInfo"))
		// ZTE fallback for optical power
		if rxPower == "" {
			rxPower = getInformParam(msg,
				"InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower",
				"InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.RXPower")
			setMapValue(valmap, "fiber_rx_power", rxPower)
		}
		if txPower == "" {
			txPower = getInformParam(msg,
				"InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower",
				"InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.TXPower")
			setMapValue(valmap, "fiber_tx_power", txPower)
		}
		// Detect ONT from optical parameters if device_type was not set
		if rxPower != "" || txPower != "" {
			setMapValue(valmap, "device_type", DeviceTypeONT)
		}
	}
}

// applyVendorSpecificParamsFromMap extracts vendor-specific parameters from a param map
func (c *CwmpCpe) applyVendorSpecificParamsFromMap(valmap map[string]interface{}, params map[string]string) {
	var getParam = func(name string) string {
		v, ok := params[name]
		if ok {
			return v
		}
		return ""
	}
	m := strings.ToLower(c.Manufacturer)
	switch {
	case strings.Contains(m, "mikrotik"):
		setMapValue(valmap, "arch_name", getParam("Device.DeviceInfo.X_MIKROTIK_ArchName"))
		setMapValue(valmap, "system_name", getParam("Device.DeviceInfo.X_MIKROTIK_SystemIdentity"))
	default:
		setMapValue(valmap, "system_name", getParam("Device.DeviceInfo.ModelName"))
		setMapValue(valmap, "fiber_rx_power", getParam("Device.Optical.Interface.1.RxPower"))
		setMapValue(valmap, "fiber_tx_power", getParam("Device.Optical.Interface.1.TxPower"))
		setMapValue(valmap, "pon_sn_hex", getParam("Device.DeviceInfo.SerialNumber"))
		setMapValue(valmap, "olt_uplink", getParam("Device.Optical.Interface.1.UpperLayers"))
		// Uptime & CPU (TR-098 fallback)
		uptime := getParam("InternetGatewayDevice.DeviceInfo.UpTime")
		if uptime != "" {
			setMapValue(valmap, "uptime", uptime)
		}
		cpuUsage := getParam("InternetGatewayDevice.DeviceInfo.ProcessStatus.CPUUsage")
		if cpuUsage == "" {
			cpuUsage = getParam("InternetGatewayDevice.DeviceInfo.X_CMS_CPUUsage")
		}
		if cpuUsage != "" {
			setMapValue(valmap, "cpu_usage", cpuUsage)
		}
		// TR-098 fallbacks
		if valmap["fiber_rx_power"] == nil || valmap["fiber_rx_power"] == "" {
			setMapValue(valmap, "fiber_rx_power", getParam("InternetGatewayDevice.DeviceInfo.XponInterface.RXPower"))
		}
		if valmap["fiber_tx_power"] == nil || valmap["fiber_tx_power"] == "" {
			setMapValue(valmap, "fiber_tx_power", getParam("InternetGatewayDevice.DeviceInfo.XponInterface.TXPower"))
		}
		// ZTE fallback
		if valmap["fiber_rx_power"] == nil || valmap["fiber_rx_power"] == "" {
			rx := getParam("InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower")
			if rx == "" {
				rx = getParam("InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.RXPower")
			}
			setMapValue(valmap, "fiber_rx_power", rx)
		}
		if valmap["fiber_tx_power"] == nil || valmap["fiber_tx_power"] == "" {
			tx := getParam("InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower")
			if tx == "" {
				tx = getParam("InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.TXPower")
			}
			setMapValue(valmap, "fiber_tx_power", tx)
		}
		// WiFi SSIDs (multi-SSID with passwords)
		wifiJson := parseWifiSsids(params)
		if wifiJson != "" {
			setMapValue(valmap, "wifi_ssid", wifiJson)
		}
		// WAN connections
		wanJson := parseWanConnections(params)
		if wanJson != "" {
			setMapValue(valmap, "wan_info", wanJson)
		}
		// Connected LAN/WiFi devices
		hostsJson := parseHostDevices(params)
		if hostsJson != "" {
			setMapValue(valmap, "lan_clients", hostsJson)
		}
	}
}

// getFactoryConfigFileType returns the appropriate factory config file type based on manufacturer
func (c *CwmpCpe) getFactoryConfigFileType() string {
	m := strings.ToLower(c.Manufacturer)
	if strings.Contains(m, "mikrotik") {
		return "X MIKROTIK Factory Configuration File"
	}
	return "3 Vendor Configuration File"
}

func (c *CwmpCpe) OnInformUpdate() {
	msg := c.LastInform
	valmap := map[string]interface{}{}
	// Generic TR-069 parameters (all vendors)
	setMapValue(valmap, "manufacturer", msg.Manufacturer)
	setMapValue(valmap, "product_class", msg.ProductClass)
	setMapValue(valmap, "oui", msg.OUI)
	setMapValue(valmap, "cwmp_status", "online")
	setMapValue(valmap, "cwmp_last_inform", time.Now())
	setMapValue(valmap, "cwmp_url", getInformParam(msg,
		"Device.ManagementServer.ConnectionRequestURL",
		"InternetGatewayDevice.ManagementServer.ConnectionRequestURL"))
	setMapValue(valmap, "software_version", getInformParam(msg,
		"Device.DeviceInfo.SoftwareVersion",
		"InternetGatewayDevice.DeviceInfo.SoftwareVersion"))
	setMapValue(valmap, "hardware_version", getInformParam(msg,
		"Device.DeviceInfo.HardwareVersion",
		"InternetGatewayDevice.DeviceInfo.HardwareVersion"))
	setMapValue(valmap, "model", getInformParam(msg,
		"Device.DeviceInfo.ModelName",
		"InternetGatewayDevice.DeviceInfo.ModelName"))
	setMapValue(valmap, "uptime", getInformParam(msg,
		"Device.DeviceInfo.UpTime",
		"InternetGatewayDevice.DeviceInfo.UpTime"))
	setMapValue(valmap, "cpu_usage", getInformParam(msg,
		"Device.DeviceInfo.ProcessStatus.CPUUsage",
		"InternetGatewayDevice.DeviceInfo.ProcessStatus.CPUUsage"))
	setMapValue(valmap, "memory_total", getInformParam(msg,
		"Device.DeviceInfo.MemoryStatus.Free",
		"InternetGatewayDevice.DeviceInfo.MemoryStatus.Free"))
	setMapValue(valmap, "memory_free", getInformParam(msg,
		"Device.DeviceInfo.MemoryStatus.Total",
		"InternetGatewayDevice.DeviceInfo.MemoryStatus.Total"))
	// Vendor-specific parameters
	c.applyVendorSpecificParams(valmap, msg)

	// Fallback: if pon_sn_hex was not found in Inform params, use device SN from DeviceId
	if _, ok := valmap["pon_sn_hex"]; !ok && c.Sn != "" {
		valmap["pon_sn_hex"] = c.Sn
	}

	if len(valmap) > 0 {
		err := app.gormDB.Model(&models.NetCpe{}).Where("sn=?", c.Sn).Updates(valmap)
		if err.Error != nil {
			log.Error("EventCwmpInformUpdate error: ", err)
		}
	}
}

func (c *CwmpCpe) OnInformUpdateOnline() {
	err := app.gormDB.Model(&models.NetCpe{}).Where("sn=?", c.Sn).Updates(map[string]interface{}{
		"cwmp_status":      "online",
		"cwmp_last_inform": time.Now(),
	}).Error
	if err != nil {
		log.Error("EventCwmpInformUpdateOnline error: ", err)
	}
}

func (c *CwmpCpe) OnParamsUpdate(params map[string]string) {
	var getParam = func(name string) string {
		v, ok := params[name]
		if ok {
			return v
		}
		return ""
	}
	valmap := map[string]interface{}{}
	// Generic TR-069 parameters (all vendors)
	setMapValue(valmap, "cwmp_last_inform", time.Now())
	setMapValue(valmap, "cwmp_status", "online")
	setMapValue(valmap, "cwmp_url", getParam("Device.ManagementServer.ConnectionRequestURL"))
	setMapValue(valmap, "software_version", getParam("Device.DeviceInfo.SoftwareVersion"))
	setMapValue(valmap, "hardware_version", getParam("Device.DeviceInfo.HardwareVersion"))
	setMapValue(valmap, "model", getParam("Device.DeviceInfo.ModelName"))
	setMapValue(valmap, "uptime", getParam("Device.DeviceInfo.UpTime"))
	setMapValue(valmap, "cpu_usage", getParam("Device.DeviceInfo.ProcessStatus.CPUUsage"))
	setMapValue(valmap, "memory_total", getParam("Device.DeviceInfo.MemoryStatus.Free"))
	setMapValue(valmap, "memory_free", getParam("Device.DeviceInfo.MemoryStatus.Total"))
	// Vendor-specific parameters
	c.applyVendorSpecificParamsFromMap(valmap, params)

	if len(valmap) > 0 {
		err := app.gormDB.Model(&models.NetCpe{}).Where("sn=?", c.Sn).Updates(valmap).Error
		if err != nil {
			log.Error("OnParamsUpdate error: ", err.Error())
		} else {
			log.Info("OnParamsUpdate success")
		}
	}
	app.UpdateCwmpCpeRundata(c.Sn, params)
}

func (a *Application) UpdateCwmpCpeRundata(sn string, vmap map[string]string) {
	var pids []string
	var params []models.NetCpeParam
	for k, v := range vmap {
		pid := common.Md5Hash(sn + k)
		if common.InSlice(pid, pids) {
			continue
		}
		tag := ""
		switch {
		case strings.Contains(k, "Device.DeviceInfo."):
			tag = "Device.DeviceInfo."
		case strings.Contains(k, "Device.ManagementServer."):
			tag = "Device.ManagementServer."
		case strings.Contains(k, "Device.InterfaceStack."):
			tag = "Device.InterfaceStack."
		case strings.Contains(k, "Device.Cellular."):
			tag = "Device.Cellular."
		case strings.Contains(k, "Device.Ethernet."):
			tag = "Device.Ethernet."
		case strings.Contains(k, "Device.WiFi."):
			tag = "Device.WiFi."
		case strings.Contains(k, "Device.PPP."):
			tag = "Device.PPP."
		case strings.Contains(k, "Device.IP."):
			tag = "Device.IP."
		case strings.Contains(k, "Device.Routing."):
			tag = "Device.Routing."
		case strings.Contains(k, "Device.Hosts."):
			tag = "Device.Hosts."
		case strings.Contains(k, "Device.DNS."):
			tag = "Device.DNS."
		case strings.Contains(k, "Device.DHCPv4."):
			tag = "Device.DHCPv4."
		case strings.Contains(k, "Device.Firewall."):
			tag = "Device.Firewall."
		case strings.Contains(k, "Device.X_MIKROTIK_Interface."):
			tag = "Device.X_MIKROTIK_Interface."
		case strings.Contains(k, "Device.Optical."):
			tag = "Device.Optical."
		case strings.Contains(k, "Device.DSL."):
			tag = "Device.DSL."
		}

		pids = append(pids, pid)
		params = append(params, models.NetCpeParam{
			ID:        pid,
			Sn:        sn,
			Tag:       tag,
			Name:      k,
			Value:     v,
			UpdatedAt: time.Now(),
		})
	}
	err := a.gormDB.Model(&models.NetCpeParam{}).Save(&params).Error
	if err != nil {
		log.Errorf("UpdateCwmpCPERundata: %s", err.Error())
	} else {
		log.Infof("UpdateCwmpCPERundata for %s success, total %d", sn, len(pids))
	}
}

func (a *Application) InjectCwmpConfigVars(sn string, src string, extvars map[string]string) string {
	var cpe models.NetCpe
	err := a.gormDB.Model(&models.NetCpe{}).Where("sn=?", sn).First(&cpe).Error
	if err != nil {
		log.Errorf("InjectCwmpConfigVars: %s", err.Error())
	}
	tx := template.Must(template.New("cpe_cwmp_config_content").Parse(src))
	var bs []byte
	buff := bytes.NewBuffer(bs)

	token, _ := web.CreateToken(a.appConfig.Tr069.Secret, "cpe", "api", time.Hour*24*365)

	vars := map[string]interface{}{
		"cpe":                              cpe,
		"TeamsacsApiToken":                 token,
		ConfigTR069AccessAddress:           a.GetTr069SettingsStringValue(ConfigTR069AccessAddress),
		ConfigTR069AccessPassword:          a.GetTr069SettingsStringValue(ConfigTR069AccessPassword),
		ConfigCpeConnectionRequestPassword: a.GetTr069SettingsStringValue(ConfigCpeConnectionRequestPassword),
	}

	for k, v := range extvars {
		vars[k] = v
	}

	err = tx.Execute(buff, vars)
	if err != nil {
		log.Errorf("InjectCwmpConfigVars: %s", err.Error())
		return src
	}
	return buff.String()
}

func (a *Application) GetCacrtContent() string {
	caCert := path.Join(a.appConfig.System.Workdir, "private/ca.crt")
	crtdata, err := os.ReadFile(caCert)
	if err != nil {
		crtdata = assets.CaCrt
	}
	return strings.TrimSpace(string(crtdata))
}

func (a *Application) MatchDevice(c models.NetCpe, oui, productClass, softwareVersion string) bool {
	var ov, pv, sv int
	if !common.InSlice(oui, []string{"", "any", "N/A", "all"}) &&
		!common.InSlice(c.Oui, strings.Split(oui, ",")) {
		ov = 1
	}
	if !common.InSlice(productClass, []string{"", "any", "N/A", "all"}) &&
		!common.InSlice(c.ProductClass, strings.Split(productClass, ",")) {
		pv = 1
	}
	if !common.InSlice(softwareVersion, []string{"", "any", "N/A", "all"}) &&
		!common.InSlice(c.SoftwareVersion, strings.Split(softwareVersion, ",")) {
		sv = 1
	}
	return ov+pv+sv == 0
}
