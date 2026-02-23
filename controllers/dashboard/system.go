package dashboard

import (
	"math"
	"os"
	"runtime"
	"time"

	"github.com/ca17/teamsacs/common"
	"github.com/ca17/teamsacs/common/echarts"
	"github.com/ca17/teamsacs/common/zaplog"
	"github.com/ca17/teamsacs/webserver"
	"github.com/labstack/echo/v4"
	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/disk"
	"github.com/shirou/gopsutil/host"
	"github.com/shirou/gopsutil/mem"
	"github.com/shirou/gopsutil/process"
)

func initSystemMetricsRouter() {

	webserver.GET("/admin/sysstatus/data", func(c echo.Context) error {
		type sysInfo struct {
			Hostname       string  `json:"hostname"`
			OS             string  `json:"os"`
			Uptime         uint64  `json:"uptime"`
			CPUUsage       float64 `json:"cpu_usage"`
			CPUCores       int     `json:"cpu_cores"`
			MemTotal       uint64  `json:"mem_total"`
			MemUsed        uint64  `json:"mem_used"`
			MemFree        uint64  `json:"mem_free"`
			MemUsedPercent float64 `json:"mem_used_percent"`
			DiskTotal      uint64  `json:"disk_total"`
			DiskUsed       uint64  `json:"disk_used"`
			DiskFree       uint64  `json:"disk_free"`
			DiskPercent    float64 `json:"disk_percent"`
			ProcessMem     uint64  `json:"process_mem"`
			ProcessCPU     float64 `json:"process_cpu"`
			NumGoroutine   int     `json:"num_goroutine"`
			GoVersion      string  `json:"go_version"`
		}

		info := sysInfo{}

		// hostname
		info.Hostname, _ = os.Hostname()
		info.GoVersion = runtime.Version()
		info.NumGoroutine = runtime.NumGoroutine()
		info.CPUCores = runtime.NumCPU()
		info.OS = runtime.GOOS + "/" + runtime.GOARCH

		// CPU
		cpuPercent, err := cpu.Percent(0, false)
		if err == nil && len(cpuPercent) > 0 {
			info.CPUUsage = math.Round(cpuPercent[0]*100) / 100
		}

		// Memory
		memInfo, err := mem.VirtualMemory()
		if err == nil {
			info.MemTotal = memInfo.Total
			info.MemUsed = memInfo.Used
			info.MemFree = memInfo.Free
			info.MemUsedPercent = math.Round(memInfo.UsedPercent*100) / 100
		}

		// Disk
		diskInfo, err := disk.Usage("/")
		if err == nil {
			info.DiskTotal = diskInfo.Total
			info.DiskUsed = diskInfo.Used
			info.DiskFree = diskInfo.Free
			info.DiskPercent = math.Round(diskInfo.UsedPercent*100) / 100
		}

		// Host uptime
		hostInfo, err := host.Info()
		if err == nil {
			info.Uptime = hostInfo.Uptime
		}

		// Process info
		p, err := process.NewProcess(int32(os.Getpid()))
		if err == nil {
			if pcpu, err := p.CPUPercent(); err == nil {
				info.ProcessCPU = math.Round(pcpu*100) / 100
			}
			if pmem, err := p.MemoryInfo(); err == nil {
				info.ProcessMem = pmem.RSS
			}
		}

		return c.JSON(200, info)
	})

	webserver.GET("/admin/metrics/cpuuse/line", func(c echo.Context) error {
		var items []echarts.MetricLineItem

		points, err := zaplog.TSDB().Select("teamsacs_cpuuse", nil,
			time.Now().Add(-24*time.Hour).Unix(), time.Now().Unix())
		if err != nil {
			return c.JSON(200, common.EmptyList)
		}
		for i, p := range points {
			items = append(items, echarts.MetricLineItem{
				Id:    i + 1,
				Time:  time.Unix(p.Timestamp, 0).Format("2006-01-02 15:04"),
				Value: p.Value,
			})
		}

		result := echarts.AvgMetricLine(items)
		tsdata := echarts.NewTimeValues()
		for _, item := range result {
			timestamp, err := time.Parse("2006-01-02 15:04", item.Time)
			if err != nil {
				continue
			}
			tsdata.AddData(timestamp.Unix()*1000, item.Value)
		}
		so := echarts.NewSeriesObject("line")
		so.SetAttr("showSymbol", false)
		so.SetAttr("smooth", true)
		so.SetAttr("areaStyle", echarts.Dict{})
		so.SetAttr("data", tsdata)

		return c.JSON(200, echarts.Series(so))
	})

	webserver.GET("/admin/metrics/memuse/line", func(c echo.Context) error {

		var items []echarts.MetricLineItem

		points, err := zaplog.TSDB().Select("teamsacs_memuse", nil,
			time.Now().Add(-24*time.Hour).Unix(), time.Now().Unix())
		if err != nil {
			return c.JSON(200, common.EmptyList)
		}
		for i, p := range points {
			items = append(items, echarts.MetricLineItem{
				Id:    i + 1,
				Time:  time.Unix(p.Timestamp, 0).Format("2006-01-02 15:04"),
				Value: p.Value,
			})
		}

		result := echarts.AvgMetricLine(items)
		tsdata := echarts.NewTimeValues()
		for _, item := range result {
			timestamp, err := time.Parse("2006-01-02 15:04", item.Time)
			if err != nil {
				continue
			}
			tsdata.AddData(timestamp.Unix()*1000, item.Value)
		}
		so := echarts.NewSeriesObject("line")
		so.SetAttr("showSymbol", false)
		so.SetAttr("smooth", true)
		so.SetAttr("areaStyle", echarts.Dict{})
		so.SetAttr("data", tsdata)
		return c.JSON(200, echarts.Series(so))
	})
}
