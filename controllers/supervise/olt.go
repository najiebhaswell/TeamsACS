package supervise

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/ca17/teamsacs/app"
	"github.com/ca17/teamsacs/common"
	"github.com/ca17/teamsacs/models"
	zsnmp "github.com/ca17/teamsacs/snmp"
	"github.com/ca17/teamsacs/webserver"
	"github.com/labstack/echo/v4"
)

func initOltRouter() {
	// List OLTs
	webserver.GET("/admin/olt/list", func(c echo.Context) error {
		var olts []models.OltDevice
		app.GDB().Order("name asc").Find(&olts)
		return c.JSON(http.StatusOK, olts)
	})

	// Add OLT
	webserver.POST("/admin/olt/add", func(c echo.Context) error {
		olt := new(models.OltDevice)
		if err := c.Bind(olt); err != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"code": 1, "msg": "Invalid data"})
		}
		olt.ID = common.UUIDint64()
		if olt.SNMPPort == 0 {
			olt.SNMPPort = 161
		}
		if olt.Manufacturer == "" {
			olt.Manufacturer = "ZTE"
		}
		if olt.Model == "" {
			olt.Model = "C620"
		}
		olt.Status = "pending"

		if err := app.GDB().Create(olt).Error; err != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"code": 1, "msg": err.Error()})
		}
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "OLT added"})
	})

	// Update OLT
	webserver.POST("/admin/olt/update", func(c echo.Context) error {
		var form struct {
			ID            int64  `json:"id,string" form:"id"`
			Name          string `json:"name" form:"name"`
			IPAddress     string `json:"ip_address" form:"ip_address"`
			SNMPPort      int    `json:"snmp_port" form:"snmp_port"`
			SNMPCommunity string `json:"snmp_community" form:"snmp_community"`
			Model         string `json:"model" form:"model"`
		}
		if err := c.Bind(&form); err != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"code": 1, "msg": "Invalid data"})
		}
		updates := map[string]interface{}{
			"name":           form.Name,
			"ip_address":     form.IPAddress,
			"snmp_port":      form.SNMPPort,
			"snmp_community": form.SNMPCommunity,
			"model":          form.Model,
		}
		app.GDB().Model(&models.OltDevice{}).Where("id = ?", form.ID).Updates(updates)
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "Updated"})
	})

	// Delete OLT
	webserver.POST("/admin/olt/delete", func(c echo.Context) error {
		id := c.FormValue("id")
		app.GDB().Where("olt_id = ?", id).Delete(&models.OltOnuData{})
		app.GDB().Where("id = ?", id).Delete(&models.OltDevice{})
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "Deleted"})
	})

	// Test SNMP connection
	webserver.POST("/admin/olt/test", func(c echo.Context) error {
		ip := c.FormValue("ip_address")
		port, _ := strconv.Atoi(c.FormValue("snmp_port"))
		if port == 0 {
			port = 161
		}
		community := c.FormValue("snmp_community")

		drv := zsnmp.NewZTEDriver(ip, port, community)
		info, err := drv.TestConnection()
		if err != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{
				"code": 1, "msg": err.Error(),
			})
		}
		return c.JSON(http.StatusOK, map[string]interface{}{
			"code": 0,
			"msg":  "Connection successful",
			"data": info,
		})
	})

	// Get ONU data for a specific CPE by serial number
	webserver.GET("/admin/olt/onu/:sn", func(c echo.Context) error {
		sn := strings.ToUpper(c.Param("sn"))
		var onuData models.OltOnuData
		result := app.GDB().Where("UPPER(serial_number) = ?", sn).
			Order("updated_at desc").First(&onuData)
		if result.Error != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{
				"found": false,
			})
		}

		// Get OLT info
		var olt models.OltDevice
		app.GDB().Where("id = ?", onuData.OltID).First(&olt)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"found":     true,
			"onu":       onuData,
			"olt_name":  olt.Name,
			"olt_ip":    olt.IPAddress,
			"olt_model": olt.Model,
			"sys_name":  olt.SysName,
		})
	})

	// List all ONU data for an OLT
	webserver.GET("/admin/olt/:id/onus", func(c echo.Context) error {
		oltID := c.Param("id")
		var onus []models.OltOnuData
		app.GDB().Where("olt_id = ?", oltID).Order("pon_port, onu_id").Find(&onus)
		return c.JSON(http.StatusOK, onus)
	})

	// Get full topology path for a CPE: OLT → ODC → ODP → ONU
	webserver.GET("/admin/olt/topology/:sn", func(c echo.Context) error {
		sn := strings.ToUpper(c.Param("sn"))

		// Find ONU data
		var onuData models.OltOnuData
		result := app.GDB().Where("UPPER(serial_number) = ?", sn).
			Order("updated_at desc").First(&onuData)
		if result.Error != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"found": false})
		}

		// Get OLT info
		var olt models.OltDevice
		app.GDB().Where("id = ?", onuData.OltID).First(&olt)

		// Find CPE to get its ODP assignment
		var cpe models.NetCpe
		app.GDB().Where("UPPER(sn) = ?", sn).First(&cpe)

		// Find ODP: prefer CPE's direct odp_id
		var odps []models.OdpDevice
		if cpe.OdpID > 0 {
			var odp models.OdpDevice
			if app.GDB().Where("id = ?", cpe.OdpID).First(&odp).Error == nil {
				odps = append(odps, odp)
			}
		}

		// Find ODC: from ODP's odc_id, or by PON port match
		var odcs []models.OdcDevice
		if len(odps) > 0 && odps[0].OdcID > 0 {
			var odc models.OdcDevice
			if app.GDB().Where("id = ?", odps[0].OdcID).First(&odc).Error == nil {
				odcs = append(odcs, odc)
			}
		} else if onuData.PONPort != "" {
			app.GDB().Where("pon_port = ?", onuData.PONPort).Find(&odcs)
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"found": true,
			"olt": map[string]interface{}{
				"name":     olt.Name,
				"ip":       olt.IPAddress,
				"model":    olt.Model,
				"sys_name": olt.SysName,
				"status":   olt.Status,
			},
			"pon_port": onuData.PONPort,
			"onu": map[string]interface{}{
				"sn":          onuData.SerialNumber,
				"name":        onuData.OnuName,
				"type":        onuData.OnuType,
				"onu_id":      onuData.OnuID,
				"phase_state": onuData.PhaseState,
				"rx_power":    onuData.RxPower,
			},
			"odcs": odcs,
			"odps": odps,
		})
	})
}
