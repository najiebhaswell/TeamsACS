package snmp

import (
	"log"
	"time"

	"github.com/ca17/teamsacs/app"
	"github.com/ca17/teamsacs/models"
)

// OLTPoller runs background SNMP polling for all OLTs
type OLTPoller struct {
	interval time.Duration
	stopChan chan struct{}
}

// NewOLTPoller creates a poller
func NewOLTPoller(intervalMinutes int) *OLTPoller {
	if intervalMinutes <= 0 {
		intervalMinutes = 5
	}
	return &OLTPoller{
		interval: time.Duration(intervalMinutes) * time.Minute,
		stopChan: make(chan struct{}),
	}
}

// Start begins polling
func (p *OLTPoller) Start() {
	log.Printf("[OLTPoller] Started (interval: %v)", p.interval)

	// Initial poll after 10 seconds delay
	time.AfterFunc(10*time.Second, func() {
		p.pollAll()
	})

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			p.pollAll()
		case <-p.stopChan:
			log.Println("[OLTPoller] Stopped")
			return
		}
	}
}

// Stop stops polling
func (p *OLTPoller) Stop() {
	close(p.stopChan)
}

func (p *OLTPoller) pollAll() {
	var olts []models.OltDevice
	if err := app.GDB().Where("status != ?", "disabled").Find(&olts).Error; err != nil {
		log.Printf("[OLTPoller] Failed to fetch OLTs: %v", err)
		return
	}

	log.Printf("[OLTPoller] Polling %d OLTs...", len(olts))
	for _, olt := range olts {
		go p.pollOLT(olt)
	}
}

func (p *OLTPoller) pollOLT(olt models.OltDevice) {
	drv := NewZTEDriverWithModel(olt.IPAddress, olt.SNMPPort, olt.SNMPCommunity, olt.Model)

	// Test connection and update sys info
	info, err := drv.TestConnection()
	if err != nil {
		log.Printf("[OLTPoller] %s (%s) offline: %v", olt.Name, olt.IPAddress, err)
		app.GDB().Model(&olt).Updates(map[string]interface{}{
			"status":       "offline",
			"last_poll_at": time.Now(),
		})
		return
	}

	app.GDB().Model(&olt).Updates(map[string]interface{}{
		"status":       "online",
		"sys_name":     info.SysName,
		"sys_descr":    info.SysDescr,
		"sys_uptime":   info.Uptime,
		"last_poll_at": time.Now(),
	})

	// Poll ONUs
	onus, err := drv.PollONUs()
	if err != nil {
		log.Printf("[OLTPoller] %s ONU poll failed: %v", olt.Name, err)
		return
	}

	log.Printf("[OLTPoller] %s: %d ONUs polled", olt.Name, len(onus))

	// Upsert ONU data
	for _, onu := range onus {
		data := models.OltOnuData{
			OltID:        olt.ID,
			SerialNumber: onu.SerialNumber,
			PONPort:      onu.PONPort,
			OnuID:        onu.OnuID,
			OnuName:      onu.Name,
			OnuType:      onu.Type,
			PhaseState:   onu.PhaseState,
			RxPower:      onu.RxPower,
			OnlineTime:   onu.OnlineTime,
			OfflineTime:  onu.OfflineTime,
			IfIndex:      onu.IfIndex,
		}

		// Try update first, then insert
		result := app.GDB().
			Where("olt_id = ? AND serial_number = ?", olt.ID, onu.SerialNumber).
			Assign(map[string]interface{}{
				"pon_port":     data.PONPort,
				"onu_id":       data.OnuID,
				"onu_name":     data.OnuName,
				"onu_type":     data.OnuType,
				"phase_state":  data.PhaseState,
				"rx_power":     data.RxPower,
				"online_time":  data.OnlineTime,
				"offline_time": data.OfflineTime,
				"if_index":     data.IfIndex,
			}).
			FirstOrCreate(&data)

		if result.Error != nil {
			log.Printf("[OLTPoller] Failed to upsert ONU %s: %v", onu.SerialNumber, result.Error)
		}
	}
}
