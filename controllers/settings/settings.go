package settings

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ca17/teamsacs/app"
	"github.com/ca17/teamsacs/assets"
	"github.com/ca17/teamsacs/common"
	"github.com/ca17/teamsacs/common/web"
	"github.com/ca17/teamsacs/models"
	"github.com/ca17/teamsacs/webserver"
	"github.com/labstack/echo/v4"
	"github.com/labstack/gommon/log"
)

func InitRouter() {

	// settings page
	webserver.GET("/admin/settings", func(c echo.Context) error {
		return c.Render(http.StatusOK, "settings", nil)
	})

	// query settings
	webserver.GET("/admin/settings/:type/query", func(c echo.Context) error {
		ctype := c.Param("type")
		var result = make(map[string]interface{})
		var data []models.SysConfig
		if err := app.GDB().Where("type", ctype).Order("sort").Find(&data).Error; err != nil {
			log.Error(err)
			return c.JSON(http.StatusOK, result)
		}
		for _, datum := range data {
			result[datum.Name] = datum.Value
		}
		return c.JSON(http.StatusOK, result)
	})

	webserver.GET("/admin/settings/configlist", func(c echo.Context) error {
		type item struct {
			Name  string `json:"name"`
			Title string `json:"title"`
			Icon  string `json:"icon"`
		}
		var data []item
		data = append(data, item{Name: "system", Title: "System config", Icon: "mdi mdi-cogs"})
		data = append(data, item{Name: "tr069", Title: "TR069 config", Icon: "mdi mdi-switch"})
		return c.JSON(http.StatusOK, data)
	})

	// update settings
	webserver.POST("/admin/settings/save", func(c echo.Context) error {
		var op, id, value string
		web.NewParamReader(c).
			ReadRequiedString(&op, "webix_operation").
			ReadRequiedString(&id, "id").
			ReadRequiedString(&value, "value")
		switch op {
		case "update":
			app.GDB().Model(&models.SysConfig{}).Where("id=?", id).Updates(map[string]interface{}{
				"value": value,
			})
			return c.JSON(http.StatusOK, map[string]interface{}{"status": "updated"})
		}
		return c.JSON(http.StatusOK, map[string]interface{}{})
	})

	webserver.POST("/admin/settings/add", func(c echo.Context) error {
		form := new(models.SysConfig)
		form.ID = common.UUIDint64()
		form.CreatedAt = time.Now()
		form.UpdatedAt = time.Now()
		common.Must(c.Bind(form))
		common.CheckEmpty("name", form.Name)
		common.CheckEmpty("sort", form.Sort)
		common.CheckEmpty("type", form.Type)

		var count int64 = 0
		app.GDB().Model(models.SysConfig{}).Where("type=? and name = ?", form.Type, form.Name).Count(&count)
		if count > 0 {
			return c.JSON(http.StatusOK, web.RestError("configuration name already exists"))
		}

		common.Must(app.GDB().Create(form).Error)
		webserver.PubOpLog(c, fmt.Sprintf("Create settings information：%v", form))
		return c.JSON(http.StatusOK, web.RestSucc("success"))
	})

	webserver.POST("/admin/settings/update", func(c echo.Context) error {
		values, err := c.FormParams()
		common.Must(err)
		ctype := c.FormValue("ctype")
		for k, _ := range values {
			if common.InSlice(k, []string{"submit", "ctype"}) {
				continue
			}
			app.GDB().Debug().Model(models.SysConfig{}).Where("type=? and name = ?", ctype, k).Update("value", c.FormValue(k))
		}
		webserver.PubOpLog(c, fmt.Sprintf("Update settings information：%v", values))
		return c.JSON(http.StatusOK, web.RestSucc("success"))
	})

	webserver.GET("/admin/settings/delete", func(c echo.Context) error {
		ids := c.QueryParam("ids")
		common.Must(app.GDB().Delete(models.SysConfig{}, strings.Split(ids, ",")).Error)
		webserver.PubOpLog(c, fmt.Sprintf("Delete setting information：%s", ids))
		return c.JSON(http.StatusOK, web.RestSucc("success"))
	})

	webserver.GET("/admin/settings/tr069/quickset", func(c echo.Context) error {
		return c.Render(http.StatusOK, "cwmp_quickset", nil)
	})

	webserver.GET("/admin/settings/tr069/quickset/mikrotik_cpe_setup_tr069.rsc", func(c echo.Context) error {
		ret := app.GApp().InjectCwmpConfigVars("", assets.Tr069TeamsacsMikrotik, map[string]string{
			"CacrtContent": app.GApp().GetCacrtContent(),
		})
		c.Response().Header().Set("Content-Disposition", "attachment;filename=mikrotik_cpe_setup_tr069.rsc")
		return c.String(http.StatusOK, ret)
	})

	// Logo upload
	webserver.POST("/admin/settings/logo/upload", func(c echo.Context) error {
		file, err := c.FormFile("logo")
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError("No file uploaded"))
		}
		// Validate file type
		ext := strings.ToLower(filepath.Ext(file.Filename))
		if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".svg" && ext != ".webp" {
			return c.JSON(http.StatusOK, web.RestError("Invalid file type. Use PNG, JPG, SVG, or WebP"))
		}
		// Validate size (max 2MB)
		if file.Size > 2*1024*1024 {
			return c.JSON(http.StatusOK, web.RestError("File too large. Max 2MB"))
		}

		src, err := file.Open()
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError("Failed to read file"))
		}
		defer src.Close()

		// Ensure directory exists
		logoDir := "/var/teamsacs/public"
		os.MkdirAll(logoDir, 0755)

		// Save as logo with original extension
		logoPath := filepath.Join(logoDir, "logo"+ext)
		// Remove any previous logo files
		for _, e := range []string{".png", ".jpg", ".jpeg", ".svg", ".webp"} {
			os.Remove(filepath.Join(logoDir, "logo"+e))
		}

		dst, err := os.Create(logoPath)
		if err != nil {
			return c.JSON(http.StatusOK, web.RestError("Failed to save file"))
		}
		defer dst.Close()

		if _, err = io.Copy(dst, src); err != nil {
			return c.JSON(http.StatusOK, web.RestError("Failed to write file"))
		}

		webserver.PubOpLog(c, fmt.Sprintf("Uploaded custom logo: %s", file.Filename))
		return c.JSON(http.StatusOK, web.RestSucc("Logo uploaded successfully"))
	})

	// Logo info (check if exists)
	webserver.GET("/admin/settings/logo/info", func(c echo.Context) error {
		for _, ext := range []string{".png", ".jpg", ".jpeg", ".svg", ".webp"} {
			logoPath := filepath.Join("/var/teamsacs/public", "logo"+ext)
			if _, err := os.Stat(logoPath); err == nil {
				return c.JSON(http.StatusOK, map[string]interface{}{
					"exists": true,
					"url":    "/public/logo/logo" + ext,
				})
			}
		}
		return c.JSON(http.StatusOK, map[string]interface{}{"exists": false})
	})

	// Serve logo (public, no auth needed)
	webserver.GET("/public/logo/:file", func(c echo.Context) error {
		filename := c.Param("file")
		// Security: only allow logo files
		if !strings.HasPrefix(filename, "logo.") {
			return c.NoContent(http.StatusNotFound)
		}
		logoPath := filepath.Join("/var/teamsacs/public", filename)
		if _, err := os.Stat(logoPath); os.IsNotExist(err) {
			return c.NoContent(http.StatusNotFound)
		}
		return c.File(logoPath)
	})

}
