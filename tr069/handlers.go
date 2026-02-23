package tr069

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/ca17/teamsacs/app"
	"github.com/ca17/teamsacs/common"
	"github.com/ca17/teamsacs/common/cwmp"
	"github.com/ca17/teamsacs/common/zaplog/log"
	"github.com/ca17/teamsacs/events"
	"github.com/ca17/teamsacs/models"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func (s *Tr069Server) initRouter() {
	s.root.Add(http.MethodPost, "", s.Tr069Index)
	s.root.Add(http.MethodGet, "/cwmpfiles/:session/:token/:filename", s.Tr069ScriptAlter)
	s.root.Add(http.MethodGet, "/cwmpfiles/preset/:session/:token/:filename", s.Tr069PresetScriptAlter)
	s.root.Add(http.MethodGet, "/cwmpfiles/download/:filename", s.Tr069FirmwareDownload)
	s.root.Add(http.MethodPut, "/cwmpupload/:session/:token/:filename", s.Tr069Upload)
	s.root.Add(http.MethodPost, "/cwmpupload/:session/:token/:filename", s.Tr069Upload)
}

func (s *Tr069Server) Tr069Upload(c echo.Context) error {
	var session = c.Param("session")
	var token = c.Param("token")
	if session == "" || token == "" {
		return c.String(400, "bad request")
	}
	if token != common.Md5Hash(session+app.GConfig().Tr069.Secret+time.Now().Format("20060102")) {
		return c.String(400, "bad token")
	}

	body := c.Request().Body
	defer body.Close()

	filename := c.Param("filename")
	_ = os.MkdirAll(path.Join(app.GConfig().System.Workdir, "cwmp"), 0777)
	dst, err := os.Create(path.Join(app.GConfig().System.Workdir, "cwmp/"+filename))
	if err != nil {
		return c.String(500, err.Error())
	}
	defer dst.Close()
	_, err = io.Copy(dst, body)
	if err != nil {
		return c.String(500, err.Error())
	}
	return c.NoContent(200)
}

func (s *Tr069Server) Tr069ScriptAlter(c echo.Context) error {
	var session = c.Param("session")
	var token = c.Param("token")
	var filename = c.Param("filename")
	if session == "" || token == "" {
		return c.String(400, "bad request")
	}
	// 文件 token 当日有效
	if token != common.Md5Hash(session+app.GConfig().Tr069.Secret+time.Now().Format("20060102")) {
		return c.String(400, "bad token")
	}
	var scriptSession models.CwmpConfigSession
	common.Must(app.GDB().Where("session = ?", session).First(&scriptSession).Error)
	log.Info2("cpe fetch cwmp file session = "+session,
		zap.String("namespace", "tr069"),
		zap.String("metrics", app.MetricsTr069Download),
	)
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("Keep-Alive", "timeout=5")
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment;filename=%s", filename))
	return c.Blob(200, echo.MIMEOctetStream, []byte(scriptSession.Content))
}

func (s *Tr069Server) Tr069PresetScriptAlter(c echo.Context) error {
	var session = c.Param("session")
	var token = c.Param("token")
	var filename = c.Param("filename")
	if session == "" || token == "" {
		return c.String(400, "bad request")
	}

	// 文件 token 当日有效
	if token != common.Md5Hash(session+app.GConfig().Tr069.Secret+time.Now().Format("20060102")) {
		return c.String(400, "bad token")
	}
	var presetTask models.CwmpPresetTask
	common.Must(app.GDB().Where("session = ?", session).First(&presetTask).Error)
	log.Info2("cpe fetch cwmp file preset session = "+session,
		zap.String("namespace", "tr069"),
		zap.String("metrics", app.MetricsTr069Download),
	)
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("Keep-Alive", "timeout=5")
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment;filename=%s", filename))
	return c.Blob(200, echo.MIMEOctetStream, []byte(presetTask.Content))
}

func (s *Tr069Server) Tr069FirmwareDownload(c echo.Context) error {
	filename := c.Param("filename")
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		return c.String(http.StatusBadRequest, "bad request")
	}
	c.Response().Header().Set("Content-Disposition", "attachment;filename="+filename)
	return c.File(path.Join(app.GConfig().System.Workdir, "cwmp", filename))
}

func (s *Tr069Server) Tr069Index(c echo.Context) error {
	logRequestHeader(c)
	cookie, _ := c.Cookie(Tr069CookieName)
	if cookie != nil {
		log.Info2(fmt.Sprintf("cwmp cooike session sn = %s", cookie.Value), zap.String("namespace", "tr069"))
	}

	requestBody, err := io.ReadAll(c.Request().Body)
	var bodyLen = len(requestBody)
	if err != nil {
		return c.String(http.StatusBadRequest, fmt.Sprintf("cwmp read error %s", err.Error()))
	}

	// if bodyLen == 0 {
	// 	log.NsInfo("tr069","recv cpe empty message")
	// } else {
	// 	log.NsInfo("tr069",string(requestBody))
	// }

	var msg cwmp.Message
	var lastInform *cwmp.Inform

	if bodyLen > 0 {
		log.Info2(fmt.Sprintf("recv CPE raw XML body: %s", string(requestBody)),
			zap.String("namespace", "tr069"))
		msg, err = cwmp.ParseXML(requestBody)
		if err != nil {
			log.Error2("cwmp read xml error", zap.String("namespace", "tr069"), zap.Error(err),
				zap.String("body", string(requestBody)))
			return c.String(http.StatusBadRequest, fmt.Sprintf("cwmp read xml error %s", err.Error()))
		}

		if msg.GetName() != "Inform" {
			lastestSn := s.GetLatestCookieSn(c)
			if lastestSn == "" {
				return c.String(http.StatusUnauthorized, "no cookie sn")
			}
			cpe := app.GApp().CwmpTable().GetCwmpCpe(lastestSn)
			if cpe.LastInform == nil {
				return c.String(http.StatusUnauthorized, "no cookie cpe data")
			}
			lastInform = cpe.LastInform
		}

		log.Info2(fmt.Sprintf("recv CPE %s Message: %s ", msg.GetName(), msg.GetID()),
			zap.String("namespace", "tr069"),
			zap.String("ipaddr", c.RealIP()),
			zap.String("metrics", app.MetricsTr069MessageTotal),
		)

		// if app.Config.Tr069.Debug {
		// 	log.NsInfo("tr069",common.ToJson(msg))
		// }

		switch msg.GetName() {
		case "Inform":
			log.Info2("recv inform message",
				zap.String("namespace", "tr069"),
				zap.String("msgid", msg.GetID()),
				zap.String("msgtype", msg.GetName()),
				zap.String("ipaddr", c.RealIP()),
				zap.String("metrics", app.MetricsTr069Inform),
			)
			return s.processInform(c, lastInform, msg)
		case "TransferComplete":
			return s.processTransferComplete(c, msg)
		case "GetRPCMethods":
			gm := msg.(*cwmp.GetRPCMethods)
			resp := new(cwmp.GetRPCMethodsResponse)
			resp.ID = gm.ID
			response := resp.CreateXML()
			return xmlCwmpMessage(c, response)
		case "GetParameterValuesResponse":
			gm := msg.(*cwmp.GetParameterValuesResponse)
			lastestSn := s.GetLatestCookieSn(c)
			if lastestSn != "" {
				app.GApp().CwmpTable().GetCwmpCpe(lastestSn).OnParamsUpdate(gm.Values)
				events.PubEventCwmpSuperviseStatus(lastestSn, msg.GetID(), "info",
					fmt.Sprintf("Recv Cwmp %s Message %s", msg.GetName(), common.ToJson(msg)))
			}
			// Check DB preset tasks for pending commands after processing response
			if lastestSn != "" {
				log.Infof("GetParameterValuesResponse: checking preset tasks for sn=%s", lastestSn)
				cpe := app.GApp().CwmpTable().GetCwmpCpe(lastestSn)
				ptask, pterr := cpe.GetLatestCwmpPresetTask()
				log.Infof("GetParameterValuesResponse: preset task result: err=%v, task=%v", pterr, ptask != nil)
				if pterr == nil && ptask != nil && len(ptask.Request) > 0 {
					log.Infof("GetParameterValuesResponse: sending preset task %s", ptask.Name)
					return xmlCwmpMessage(c, []byte(ptask.Request))
				}
				// Also check memory queue
				qmsg, qerr := cpe.RecvCwmpEventData(500, true)
				if qerr != nil {
					qmsg, _ = cpe.RecvCwmpEventData(500, false)
				}
				if qmsg != nil {
					if qmsg.Session != "" {
						events.PubEventCwmpSuperviseStatus(lastestSn, qmsg.Session, "info",
							fmt.Sprintf("Send Cwmp %s Message %s", qmsg.Message.GetName(), common.ToJson(qmsg.Message)))
					}
					return xmlCwmpMessage(c, qmsg.Message.CreateXML())
				}
			}
		case "SetParameterValuesResponse":
			lastestSn := s.GetLatestCookieSn(c)
			if lastestSn != "" {
				events.PubEventCwmpSuperviseStatus(lastestSn, msg.GetID(), "info",
					fmt.Sprintf("Recv Cwmp %s Message %s", msg.GetName(), common.ToJson(msg)))
				err := app.UpdateCwmpPresetTaskStatus(msg)
				if err != nil {
					log.Error2("UpdateCwmpPresetTaskStatus error",
						zap.String("namespace", "tr069"), zap.Error(err))
				}
				cpe := app.GApp().CwmpTable().GetCwmpCpe(lastestSn)
				// Check for more pending preset tasks from DB (e.g., Enable after SSID change)
				ptask, pterr := cpe.GetLatestCwmpPresetTask()
				if pterr == nil && ptask != nil && len(ptask.Request) > 0 {
					log.Infof("SetParameterValuesResponse: sending next preset task from DB %s", ptask.Name)
					return xmlCwmpMessage(c, []byte(ptask.Request))
				}
				// Also check channel for any pending direct commands
				qmsg, qerr := cpe.RecvCwmpEventData(100, true)
				if qerr != nil {
					qmsg, _ = cpe.RecvCwmpEventData(100, false)
				}
				if qmsg != nil {
					if qmsg.Session != "" {
						events.PubEventCwmpSuperviseStatus(lastestSn, qmsg.Session, "info",
							fmt.Sprintf("Send Cwmp %s Message %s", qmsg.Message.GetName(), common.ToJson(qmsg.Message)))
					}
					log.Infof("SetParameterValuesResponse: sending pending task from channel for sn=%s", lastestSn)
					return xmlCwmpMessage(c, qmsg.Message.CreateXML())
				}
			}
		case "GetParameterNamesResponse":
			gm := msg.(*cwmp.GetParameterNamesResponse)
			lastestSn := s.GetLatestCookieSn(c)
			if lastestSn != "" && msg.GetID() != "" {
				if strings.HasPrefix(msg.GetID(), "bootstrap-session") {
					go app.GApp().CwmpTable().GetCwmpCpe(lastestSn).ProcessParameterNamesResponse(gm)
				}
				if len(gm.Params) < 100 {
					events.PubEventCwmpSuperviseStatus(lastestSn, msg.GetID(), "info",
						fmt.Sprintf("Recv Cwmp %s Message %s", msg.GetName(), common.ToJson(msg)))
				} else {
					events.PubEventCwmpSuperviseStatus(lastestSn, msg.GetID(), "info",
						fmt.Sprintf("Recv Cwmp %s Message，names total %d", msg.GetName(), len(gm.Params)))
				}
			}
		default:
			log.Info2("unhandled message type",
				zap.String("namespace", "tr069"),
				zap.String("msgtype", msg.GetName()))
			lastestSn := s.GetLatestCookieSn(c)
			if lastestSn != "" {
				events.PubEventCwmpSuperviseStatus(lastestSn, msg.GetID(), "info",
					fmt.Sprintf("Recv Cwmp %s Message %s", msg.GetName(), common.ToJson(msg)))
			}
		}
	} else {
		// 当 CPE 发送空消息时检测 CPE任务队列
		lastestSn := s.GetLatestCookieSn(c)
		log.Infof("Empty POST handler: sn=%s", lastestSn)
		if lastestSn == "" {
			return noContentResp(c)
		}

		cpe := app.GApp().CwmpTable().GetCwmpCpe(lastestSn)

		// 首先处理预设任务
		ptask, err := cpe.GetLatestCwmpPresetTask()
		log.Infof("Empty POST: preset task check: err=%v, hasTask=%v", err, ptask != nil)
		if err == nil && ptask != nil && len(ptask.Request) > 0 {
			log.Infof("Empty POST: sending preset task %s", ptask.Name)
			return xmlCwmpMessage(c, []byte(ptask.Request))
		}

		// 获取队列任务
		msg, err := cpe.RecvCwmpEventData(1000, true)
		if err != nil {
			msg, _ = cpe.RecvCwmpEventData(1000, false)
		}

		if msg != nil {
			if msg.Session != "" {
				events.PubEventCwmpSuperviseStatus(lastestSn, msg.Session, "info",
					fmt.Sprintf("Send Cwmp %s Message %s", msg.Message.GetName(), common.ToJson(msg.Message)))
			}
			return xmlCwmpMessage(c, msg.Message.CreateXML())
		}
	}

	// for {
	// 	select {
	// 	case <-c.Request().Context().Done():
	// 		return nil
	// 	case <-time.After(time.Second * 120):
	// 		return nil
	// 	}
	// }

	return noContentResp(c)
}

// 处理 CPE -> ACS TransferComplete 事件
func (s *Tr069Server) processTransferComplete(c echo.Context, msg cwmp.Message) error {
	tc := msg.(*cwmp.TransferComplete)
	// do something
	resp := new(cwmp.TransferCompleteResponse)
	resp.ID = tc.ID
	response := resp.CreateXML()
	go func() {
		if tc.CommandKey != "" {
			events.PubEventCwmpSuperviseStatus("", tc.CommandKey, "info",
				fmt.Sprintf("Recv Cwmp %s Message %s", msg.GetName(), common.ToJson(msg)))

			err := app.UpdateCwmpPresetTaskStatus(tc)
			if err != nil && err != gorm.ErrRecordNotFound {
				log.Error2("UpdateCwmpPresetTaskStatus error", zap.String("namespace", "tr069"), zap.Error(err))
			}

			err = app.UpdateCwmpConfigSessionStatus(tc)
			if err != nil && err != gorm.ErrRecordNotFound {
				log.Error2("UpdateCwmpConfigSessionStatus error", zap.String("namespace", "tr069"), zap.Error(err))
			}
		}
	}()
	return xmlCwmpMessage(c, response)
}

// 处理 CPE -> ACS Inform 事件
func (s *Tr069Server) processInform(c echo.Context, lastInform *cwmp.Inform, msg cwmp.Message) error {
	lastInform = msg.(*cwmp.Inform)
	s.SetLatestInformByCookie(c, lastInform.Sn)
	// response
	resp := new(cwmp.InformResponse)
	resp.ID = lastInform.ID
	resp.MaxEnvelopes = lastInform.MaxEnvelopes
	response := resp.CreateXML()

	go s.processInformEvent(c, lastInform)

	// Check channel for pending messages (e.g., WiFi/WAN params set from dashboard)
	// This allows immediate execution without waiting for empty POST
	cpe := app.GApp().CwmpTable().GetCwmpCpe(lastInform.Sn)
	qmsg, qerr := cpe.RecvCwmpEventData(100, true)
	if qerr != nil {
		qmsg, _ = cpe.RecvCwmpEventData(100, false)
	}
	if qmsg != nil {
		if qmsg.Session != "" {
			events.PubEventCwmpSuperviseStatus(lastInform.Sn, qmsg.Session, "info",
				fmt.Sprintf("Send Cwmp %s Message %s", qmsg.Message.GetName(), common.ToJson(qmsg.Message)))
		}
		log.Infof("processInform: sending pending task from channel for sn=%s", lastInform.Sn)
		return xmlCwmpMessage(c, qmsg.Message.CreateXML())
	}

	return xmlCwmpMessage(c, response)
}

func (s *Tr069Server) processInformEvent(c echo.Context, lastInform *cwmp.Inform) {
	defer func() {
		if err := recover(); err != nil {
			err2, ok := err.(error)
			if ok {
				log.Error("processInformEvent error",
					zap.String("namespace", "tr069"), zap.Error(err2))
			}
		}
	}()
	cpe := app.GApp().CwmpTable().GetCwmpCpe(lastInform.Sn)
	cpe.CheckRegister(c.RealIP(), lastInform)
	cpe.UpdateStatus(lastInform)
	// 通知系统更新数据
	cpe.NotifyDataUpdate(false)

	switch {
	// 首次接入下发认证配置
	case lastInform.IsEvent(cwmp.EventBootStrap) && lastInform.RetryCount == 0:
		err := cpe.CreateCwmpPresetEventTask(app.BootStrapEvent, "")
		if err != nil {
			log.Error2("CreateCwmpPresetEventTask error", zap.String("namespace", "tr069"), zap.Error(err))
		}
		err = cpe.UpdateManagementAuthInfo("bootstrap-session-"+common.UUID(), 1000, false)
		if err != nil {
			log.Error2("UpdateManagementAuthInfo error", zap.String("namespace", "tr069"), zap.Error(err))
		}
	case lastInform.IsEvent(cwmp.EventBoot) && lastInform.RetryCount == 0:
		err := cpe.ActiveCwmpSchedEventTask()
		if err != nil {
			log.Error2("ActiveCwmpSchedEventTask error ", zap.String("namespace", "tr069"), zap.Error(err))
		}
		err = cpe.CreateCwmpPresetEventTask(app.BootEvent, "")
		if err != nil {
			log.Error2("CreateCwmpPresetEventTask error ", zap.String("namespace", "tr069"), zap.Error(err))
		}
		err = cpe.UpdateManagementAuthInfo("bootstrap-session-"+common.UUID(), 1000, false)
		if err != nil {
			log.Error2("UpdateManagementAuthInfo error ", zap.String("namespace", "tr069"), zap.Error(err))
		}
	case lastInform.IsEvent(cwmp.EventPeriodic) && lastInform.RetryCount == 0:
		err := cpe.CreateCwmpPresetEventTask(app.PeriodicEvent, "")
		if err != nil {
			log.Error2("CreateCwmpPresetEventTask error ", zap.String("namespace", "tr069"), zap.Error(err))
		}
	case lastInform.IsEvent(cwmp.EventScheduled) && lastInform.RetryCount == 0:
		err := cpe.CreateCwmpSchedEventTask(lastInform.CommandKey)
		if err != nil {
			log.Error2("CreateCwmpSchedEventTask error", zap.String("namespace", "tr069"), zap.Error(err))
		}
	case lastInform.IsEvent(cwmp.EventValueChange) && lastInform.RetryCount == 0:
		cpe.NotifyDataUpdate(true)
		log.Info2("processInformEvent NotifyDataUpdate force=true",
			zap.String("namespace", "tr069"),
			zap.String("sn", lastInform.Sn),
		)
	}

	// Auto-fetch WiFi SSIDs and WAN info after every Inform (not included in Inform params)
	// Detect data model from Inform params to avoid requesting non-existent paths
	go func() {
		var paramNames []string
		// Check if device uses TR-098 (InternetGatewayDevice) or TR-181 (Device) data model
		for paramName := range lastInform.Params {
			if strings.HasPrefix(paramName, "InternetGatewayDevice.") {
				paramNames = []string{
					"InternetGatewayDevice.DeviceInfo.",
					"InternetGatewayDevice.LANDevice.1.WLANConfiguration.",
					"InternetGatewayDevice.LANDevice.1.Hosts.",
					"InternetGatewayDevice.WANDevice.",
				}
				break
			}
			if strings.HasPrefix(paramName, "Device.") {
				paramNames = []string{
					"Device.WiFi.",
					"Device.IP.",
					"Device.PPP.",
				}
				break
			}
		}
		if len(paramNames) == 0 {
			return
		}
		session := "auto-fetch-" + common.UUID()
		_ = cpe.SendCwmpEventData(models.CwmpEventData{
			Session: session,
			Sn:      lastInform.Sn,
			Message: &cwmp.GetParameterValues{
				ID:             session,
				Name:           "AutoFetchParams",
				NoMore:         0,
				ParameterNames: paramNames,
			},
		}, 3000, false)
	}()
}

func xmlCwmpMessage(c echo.Context, response []byte) error {
	c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXMLCharsetUTF8)
	c.Response().Header().Set("Connection", "keep-alive")
	if app.GConfig().Tr069.Debug {
		logResponseHeader(c)
	}
	// log.NsInfo("tr069",string(response))
	return c.XMLBlob(200, response)
}

func noContentResp(c echo.Context) error {
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("Content-Length", "0")
	if app.GConfig().Tr069.Debug {
		logResponseHeader(c)
	}
	return c.NoContent(http.StatusNoContent)
}

func logRequestHeader(c echo.Context) {
	for k, v := range c.Request().Header {
		fmt.Printf("%s: %s\n", k, v)
	}
}

func logResponseHeader(c echo.Context) {
	for k, v := range c.Response().Header() {
		fmt.Printf("%s: %s\n", k, v)
	}
}
