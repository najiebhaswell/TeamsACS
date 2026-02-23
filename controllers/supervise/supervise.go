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
	"github.com/ca17/teamsacs/webserver"
	"github.com/labstack/echo/v4"
)

func InitRouter() {

	webserver.GET("/admin/supervise", func(c echo.Context) error {
		return c.Render(http.StatusOK, "supervise", nil)
	})

	webserver.GET("/admin/supervise/type/options", func(c echo.Context) error {
		var opts = make([]web.JsonOptions, 0)
		opts = append(opts, web.JsonOptions{Id: "cwmp", Value: "TR069 Preset"})
		opts = append(opts, web.JsonOptions{Id: "cwmpconfig", Value: "TR069 Config"})
		return c.JSON(http.StatusOK, opts)
	})

	webserver.GET("/admin/supervise/action/query", func(c echo.Context) error {
		var devid, ctype string
		common.Must(web.NewParamReader(c).
			ReadRequiedString(&devid, "devid").
			ReadRequiedString(&ctype, "ctype").
			LastError)

		var dev models.NetCpe
		common.Must(app.GDB().Where("id=?", devid).First(&dev).Error)

		var actions []SuperviseAction

		switch ctype {
		case "cwmpconfig":
			var data []models.CwmpConfig
			err := app.GDB().Find(&data).Error
			if err != nil {
				log.Error(err)
			}
			for _, sdata := range data {
				if !app.GApp().MatchDevice(dev, sdata.Oui, sdata.ProductClass, sdata.SoftwareVersion) {
					continue
				}
				actions = append(actions, SuperviseAction{
					Name:  sdata.Name,
					Type:  "cwmpconfig",
					Level: sdata.Level,
					Sid:   sdata.ID,
				})
			}
		case "cwmp":
			actions = append(actions, cwmpCmds...)
		}

		return c.JSON(http.StatusOK, actions)
	})

	webserver.POST("/admin/superviselog/firmware/update", func(c echo.Context) error {
		var devids, session, firmwareid string
		common.Must(web.NewParamReader(c).
			ReadRequiedString(&devids, "devids").
			ReadRequiedString(&session, "session").
			ReadRequiedString(&firmwareid, "firmwareid").LastError)
		return execCwmpUpdateFirmware(c, strings.Split(devids, ","), firmwareid, session)
	})

	webserver.GET("/admin/supervise/action/execute", func(c echo.Context) error {
		var id, stype, session string
		var deviceId int64
		common.Must(web.NewParamReader(c).
			ReadRequiedString(&session, "session").
			ReadRequiedString(&id, "id").
			ReadRequiedString(&stype, "type").
			ReadInt64(&deviceId, "devid", 0).LastError)
		switch stype {
		case "cwmp":
			return execCwmp(c, id, deviceId, session)
		case "cwmpconfig":
			return execCwmpConfig(c, id, deviceId, session)
		}
		return c.JSON(200, web.RestError("unsupported action type "+stype))
	})

	webserver.GET("/admin/supervise/action/listen", func(c echo.Context) error {
		sse := web.NewSSE(c)
		var session string
		common.Must(web.NewParamReader(c).
			ReadRequiedString(&session, "session").LastError)

		var writeMessage = func(session, level, message string) {
			if session == session {
				if level != "" {
					sse.WriteText(fmt.Sprintf("%s :: ", strings.ToUpper(level)))
				}
				for _, s := range strings.Split(message, "\n") {
					sse.WriteText(s)
				}
			}
		}

		var listenFunc = func(devid int64, session, level, message string) {
			writeMessage(session, level, message)
		}
		var listenFunc2 = func(devid int64, session, message string) {
			writeMessage(session, "", message)
		}
		var listenFunc3 = func(sn, session, level, message string) {
			writeMessage(session, level, message)
		}

		events.Supervisor.SubscribeAsync(events.EventSuperviseLog, listenFunc, false)
		events.Supervisor.SubscribeAsync(events.EventSuperviseStatus, listenFunc2, false)
		events.Supervisor.SubscribeAsync(events.EventCwmpSuperviseStatus, listenFunc3, false)
		var unsubscribe = func() {
			events.Supervisor.Unsubscribe(events.EventSuperviseLog, listenFunc)
			events.Supervisor.Unsubscribe(events.EventSuperviseStatus, listenFunc2)
			events.Supervisor.Unsubscribe(events.EventCwmpSuperviseStatus, listenFunc3)
		}
		for {
			select {
			case <-c.Request().Context().Done():
				unsubscribe()
				return nil
			case <-time.After(time.Second * 120):
				unsubscribe()
				return nil
			}
		}
	})

	// WiFi settings edit endpoint
	webserver.POST("/admin/supervise/wifi/set", func(c echo.Context) error {
		var devid string
		var ssidIdx int
		common.Must(web.NewParamReader(c).
			ReadRequiedString(&devid, "devid").
			ReadInt(&ssidIdx, "ssid_idx", 0).LastError)
		ssidName := c.FormValue("ssid")
		password := c.FormValue("password")
		channel := c.FormValue("channel")
		enable := c.FormValue("enable")

		if ssidIdx < 1 || ssidIdx > 16 {
			return c.JSON(http.StatusOK, web.RestError("Invalid SSID index"))
		}

		var dev models.NetCpe
		err := app.GDB().Where("id=?", devid).First(&dev).Error
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError("Device not found"))
		}

		cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
		_ = cpe // ensure CwmpCpe exists in memory

		err = cwmpSetWifiParams(dev, ssidIdx, ssidName, password, channel, enable)
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError(fmt.Sprintf("Failed to create WiFi task: %s", err.Error())))
		}

		webserver.PubOpLog(c, fmt.Sprintf(
			"Set WiFi params for %s: SSID[%d] ssid=%s channel=%s",
			dev.Sn, ssidIdx, ssidName, channel))

		return c.JSON(200, web.RestSucc("WiFi settings command sent, will take effect after device applies changes"))
	})

	webserver.POST("/admin/supervise/wan/set", func(c echo.Context) error {
		var devid string
		var devIdx, connIdx int
		common.Must(web.NewParamReader(c).
			ReadRequiedString(&devid, "devid").
			ReadInt(&devIdx, "dev_idx", 0).
			ReadInt(&connIdx, "conn_idx", 0).LastError)
		connType := c.FormValue("conn_type")
		username := c.FormValue("username")
		password := c.FormValue("password")
		enable := c.FormValue("enable")
		ipMode := c.FormValue("ip_mode")
		vlanID := c.FormValue("vlan_id")

		if devIdx < 1 || connIdx < 1 {
			return c.JSON(http.StatusOK, web.RestError("Invalid WAN connection index"))
		}

		var dev models.NetCpe
		err := app.GDB().Where("id=?", devid).First(&dev).Error
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError("Device not found"))
		}

		cpe := app.GApp().CwmpTable().GetCwmpCpe(dev.Sn)
		_ = cpe

		err = cwmpSetWanParams(dev, devIdx, connIdx, connType, username, password, enable, ipMode, vlanID)
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError(fmt.Sprintf("Failed to create WAN task: %s", err.Error())))
		}

		webserver.PubOpLog(c, fmt.Sprintf(
			"Set WAN params for %s: dev=%d conn=%d type=%s",
			dev.Sn, devIdx, connIdx, connType))

		return c.JSON(200, web.RestSucc("WAN settings command sent"))
	})

	webserver.POST("/admin/supervise/reboot", func(c echo.Context) error {
		var devid string
		common.Must(web.NewParamReader(c).
			ReadRequiedString(&devid, "devid").LastError)

		var dev models.NetCpe
		err := app.GDB().Where("id=?", devid).First(&dev).Error
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError("Device not found"))
		}

		session := "Reboot-" + common.UUID()
		rebootMsg := &cwmp.Reboot{ID: session}
		err = app.GDB().Create(&models.CwmpPresetTask{
			ID: common.UUIDint64(), PresetId: 0, Event: "reboot", Oid: "N/A",
			Name: "Reboot", Onfail: "ignore", Session: session, Sn: dev.Sn,
			Request: string(rebootMsg.CreateXML()), Status: "pending",
			ExecTime: time.Now(), CreatedAt: time.Now(), UpdatedAt: time.Now(),
		}).Error
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError("Failed to create reboot task"))
		}

		go connectDeviceAuth(session, dev)

		webserver.PubOpLog(c, fmt.Sprintf("Reboot device %s", dev.Sn))
		return c.JSON(200, web.RestSucc("Reboot command sent"))
	})

}
