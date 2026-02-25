package supervise

import (
	"net/http"
	"strconv"

	"github.com/ca17/teamsacs/app"
	"github.com/ca17/teamsacs/common"
	"github.com/ca17/teamsacs/models"
	"github.com/ca17/teamsacs/webserver"
	"github.com/labstack/echo/v4"
)

func initOdcOdpRouter() {
	// ---- ODC ----
	webserver.GET("/admin/odc/list", func(c echo.Context) error {
		var items []models.OdcDevice
		app.GDB().Order("name asc").Find(&items)
		return c.JSON(http.StatusOK, items)
	})

	webserver.POST("/admin/odc/add", func(c echo.Context) error {
		cap, _ := strconv.Atoi(c.FormValue("capacity"))
		oltID, _ := strconv.ParseInt(c.FormValue("olt_id"), 10, 64)
		item := models.OdcDevice{
			ID:        common.UUIDint64(),
			Name:      c.FormValue("name"),
			Location:  c.FormValue("location"),
			Address:   c.FormValue("address"),
			Latitude:  c.FormValue("latitude"),
			Longitude: c.FormValue("longitude"),
			Capacity:  cap,
			OltID:     oltID,
			PonPort:   c.FormValue("pon_port"),
			Remark:    c.FormValue("remark"),
		}
		if item.Name == "" {
			return c.JSON(http.StatusOK, map[string]interface{}{"code": 1, "msg": "Name is required"})
		}
		if err := app.GDB().Create(&item).Error; err != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"code": 1, "msg": err.Error()})
		}
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "ODC added"})
	})

	webserver.POST("/admin/odc/update", func(c echo.Context) error {
		id, _ := strconv.ParseInt(c.FormValue("id"), 10, 64)
		cap, _ := strconv.Atoi(c.FormValue("capacity"))
		oltID, _ := strconv.ParseInt(c.FormValue("olt_id"), 10, 64)
		app.GDB().Model(&models.OdcDevice{}).Where("id = ?", id).Updates(map[string]interface{}{
			"name": c.FormValue("name"), "location": c.FormValue("location"),
			"address": c.FormValue("address"), "latitude": c.FormValue("latitude"),
			"longitude": c.FormValue("longitude"), "capacity": cap,
			"olt_id": oltID, "pon_port": c.FormValue("pon_port"),
			"remark": c.FormValue("remark"),
		})
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "Updated"})
	})

	webserver.POST("/admin/odc/delete", func(c echo.Context) error {
		id := c.FormValue("id")
		app.GDB().Where("id = ?", id).Delete(&models.OdcDevice{})
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "Deleted"})
	})

	// ---- ODP ----
	webserver.GET("/admin/odp/list", func(c echo.Context) error {
		var items []models.OdpDevice
		app.GDB().Order("name asc").Find(&items)
		return c.JSON(http.StatusOK, items)
	})

	webserver.POST("/admin/odp/add", func(c echo.Context) error {
		cap, _ := strconv.Atoi(c.FormValue("capacity"))
		odcID, _ := strconv.ParseInt(c.FormValue("odc_id"), 10, 64)
		usedPorts, _ := strconv.Atoi(c.FormValue("used_ports"))
		item := models.OdpDevice{
			ID:        common.UUIDint64(),
			Name:      c.FormValue("name"),
			OdcID:     odcID,
			Location:  c.FormValue("location"),
			Address:   c.FormValue("address"),
			Latitude:  c.FormValue("latitude"),
			Longitude: c.FormValue("longitude"),
			Capacity:  cap,
			UsedPorts: usedPorts,
			Remark:    c.FormValue("remark"),
		}
		if item.Name == "" {
			return c.JSON(http.StatusOK, map[string]interface{}{"code": 1, "msg": "Name is required"})
		}
		if err := app.GDB().Create(&item).Error; err != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"code": 1, "msg": err.Error()})
		}
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "ODP added"})
	})

	webserver.POST("/admin/odp/update", func(c echo.Context) error {
		id, _ := strconv.ParseInt(c.FormValue("id"), 10, 64)
		cap, _ := strconv.Atoi(c.FormValue("capacity"))
		odcID, _ := strconv.ParseInt(c.FormValue("odc_id"), 10, 64)
		usedPorts, _ := strconv.Atoi(c.FormValue("used_ports"))
		app.GDB().Model(&models.OdpDevice{}).Where("id = ?", id).Updates(map[string]interface{}{
			"name": c.FormValue("name"), "odc_id": odcID,
			"location": c.FormValue("location"), "address": c.FormValue("address"),
			"latitude": c.FormValue("latitude"), "longitude": c.FormValue("longitude"),
			"capacity": cap, "used_ports": usedPorts,
			"remark": c.FormValue("remark"),
		})
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "Updated"})
	})

	webserver.POST("/admin/odp/delete", func(c echo.Context) error {
		id := c.FormValue("id")
		app.GDB().Where("id = ?", id).Delete(&models.OdpDevice{})
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "Deleted"})
	})

	// ODC options for ODP dropdown
	webserver.GET("/admin/odc/options", func(c echo.Context) error {
		var items []struct {
			ID   int64  `json:"id,string"`
			Name string `json:"name"`
		}
		app.GDB().Model(&models.OdcDevice{}).Select("id, name").Order("name").Find(&items)
		return c.JSON(http.StatusOK, items)
	})

	// ODP options for CPE assignment dropdown
	webserver.GET("/admin/odp/options", func(c echo.Context) error {
		var items []struct {
			ID   int64  `json:"id,string"`
			Name string `json:"name"`
		}
		app.GDB().Model(&models.OdpDevice{}).Select("id, name").Order("name").Find(&items)
		return c.JSON(http.StatusOK, items)
	})

	// Assign CPE to ODP
	webserver.POST("/admin/cpe/assign-odp", func(c echo.Context) error {
		cpeID, _ := strconv.ParseInt(c.FormValue("cpe_id"), 10, 64)
		odpID, _ := strconv.ParseInt(c.FormValue("odp_id"), 10, 64)
		app.GDB().Model(&models.NetCpe{}).Where("id = ?", cpeID).Update("odp_id", odpID)
		return c.JSON(http.StatusOK, map[string]interface{}{"code": 0, "msg": "ODP assigned"})
	})

	// List CPEs linked to an ODP
	webserver.GET("/admin/odp/:id/cpes", func(c echo.Context) error {
		odpID := c.Param("id")
		var cpes []struct {
			ID         int64  `json:"id,string"`
			Sn         string `json:"sn"`
			Name       string `json:"name"`
			Model      string `json:"model"`
			CwmpStatus string `json:"cwmp_status"`
		}
		app.GDB().Model(&models.NetCpe{}).
			Where("odp_id = ?", odpID).
			Select("id, sn, name, model, cwmp_status").
			Order("sn").Find(&cpes)
		return c.JSON(http.StatusOK, cpes)
	})
}
