package snmp

import (
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
)

// Common OIDs
const (
	oidSysName   = ".1.3.6.1.2.1.1.5.0"
	oidSysDescr  = ".1.3.6.1.2.1.1.1.0"
	oidSysUptime = ".1.3.6.1.2.1.1.3.0"

	oidIfName = ".1.3.6.1.2.1.31.1.1.1.1"
)

// C6xx / ZXAN OIDs (C620, C650, etc.)
const (
	oidC6xxOnuSerialNumber    = ".1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.6"
	oidC6xxOnuType            = ".1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.1"
	oidC6xxOnuName            = ".1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.2"
	oidC6xxOnuRxPower         = ".1.3.6.1.4.1.3902.1082.500.20.2.2.2.1.10"
	oidC6xxOnuPhaseState      = ".1.3.6.1.4.1.3902.1082.500.10.2.3.8.1.4"
	oidC6xxOnuLastOnlineTime  = ".1.3.6.1.4.1.3902.1082.500.10.2.3.8.1.5"
	oidC6xxOnuLastOfflineTime = ".1.3.6.1.4.1.3902.1082.500.10.2.3.8.1.6"
)

// C3xx OIDs (C320, C300, etc.)
const (
	oidC3xxOnuSerialNumber    = ".1.3.6.1.4.1.3902.1012.3.28.1.1.5"
	oidC3xxOnuType            = ".1.3.6.1.4.1.3902.1012.3.28.1.1.1"
	oidC3xxOnuName            = ".1.3.6.1.4.1.3902.1012.3.28.1.1.3"
	oidC3xxOnuRxPower         = ".1.3.6.1.4.1.3902.1012.3.50.12.1.1.10"
	oidC3xxOnuPhaseState      = ".1.3.6.1.4.1.3902.1012.3.28.2.1.4"
	oidC3xxOnuLastOnlineTime  = ".1.3.6.1.4.1.3902.1012.3.28.2.1.8"
	oidC3xxOnuLastOfflineTime = ".1.3.6.1.4.1.3902.1012.3.28.2.1.9"
)

// PhaseState values
var phaseStateMap = map[int]string{
	1: "logging",
	2: "los",
	3: "syncMib",
	4: "working",
	5: "dyingGasp",
	6: "authFailed",
	7: "offline",
}

// ONUData holds polled ONU data
type ONUData struct {
	IfIndex      int
	OnuID        int
	SerialNumber string
	Name         string
	Type         string
	PhaseState   string
	RxPower      float64
	PONPort      string
	OnlineTime   string
	OfflineTime  string
}

// OLTInfo holds basic OLT system info
type OLTInfo struct {
	SysName  string
	SysDescr string
	Uptime   string
}

// oidSet holds OIDs for a specific OLT platform
type oidSet struct {
	onuSerialNumber    string
	onuType            string
	onuName            string
	onuRxPower         string
	onuPhaseState      string
	onuLastOnlineTime  string
	onuLastOfflineTime string
}

// ZTEDriver SNMP driver for ZTE OLTs (C3xx and C6xx families)
type ZTEDriver struct {
	target    string
	port      uint16
	community string
	model     string // "C320", "C300", "C620", "ZXAN", etc.
}

// NewZTEDriver creates a driver instance
func NewZTEDriver(ip string, port int, community string) *ZTEDriver {
	return &ZTEDriver{
		target:    ip,
		port:      uint16(port),
		community: community,
	}
}

// NewZTEDriverWithModel creates a driver instance with model awareness
func NewZTEDriverWithModel(ip string, port int, community string, model string) *ZTEDriver {
	return &ZTEDriver{
		target:    ip,
		port:      uint16(port),
		community: community,
		model:     strings.ToUpper(model),
	}
}

// getOIDs returns the correct OID set based on the OLT model
func (d *ZTEDriver) getOIDs() oidSet {
	if d.isC3xx() {
		return oidSet{
			onuSerialNumber:    oidC3xxOnuSerialNumber,
			onuType:            oidC3xxOnuType,
			onuName:            oidC3xxOnuName,
			onuRxPower:         oidC3xxOnuRxPower,
			onuPhaseState:      oidC3xxOnuPhaseState,
			onuLastOnlineTime:  oidC3xxOnuLastOnlineTime,
			onuLastOfflineTime: oidC3xxOnuLastOfflineTime,
		}
	}
	return oidSet{
		onuSerialNumber:    oidC6xxOnuSerialNumber,
		onuType:            oidC6xxOnuType,
		onuName:            oidC6xxOnuName,
		onuRxPower:         oidC6xxOnuRxPower,
		onuPhaseState:      oidC6xxOnuPhaseState,
		onuLastOnlineTime:  oidC6xxOnuLastOnlineTime,
		onuLastOfflineTime: oidC6xxOnuLastOfflineTime,
	}
}

// isC3xx returns true if the OLT is C3xx family (C300, C320, etc.)
func (d *ZTEDriver) isC3xx() bool {
	m := strings.ToUpper(d.model)
	return strings.Contains(m, "C300") || strings.Contains(m, "C320")
}

func (d *ZTEDriver) newSNMP() *gosnmp.GoSNMP {
	return &gosnmp.GoSNMP{
		Target:         d.target,
		Port:           d.port,
		Community:      d.community,
		Version:        gosnmp.Version2c,
		Timeout:        10 * time.Second,
		Retries:        2,
		MaxRepetitions: 50,
		MaxOids:        60,
	}
}

// TestConnection tests SNMP connectivity
func (d *ZTEDriver) TestConnection() (*OLTInfo, error) {
	snmp := d.newSNMP()
	if err := snmp.Connect(); err != nil {
		return nil, fmt.Errorf("SNMP connect failed: %v", err)
	}
	defer snmp.Conn.Close()

	result, err := snmp.Get([]string{oidSysName, oidSysDescr, oidSysUptime})
	if err != nil {
		return nil, fmt.Errorf("SNMP get failed: %v", err)
	}

	info := &OLTInfo{}
	for _, v := range result.Variables {
		switch v.Name {
		case oidSysName:
			info.SysName = pduToString(v)
		case oidSysDescr:
			info.SysDescr = pduToString(v)
		case oidSysUptime:
			if uptime, ok := v.Value.(uint32); ok {
				info.Uptime = formatUptime(uptime)
			}
		}
	}
	return info, nil
}

// PollONUs polls all registered ONUs from the OLT
func (d *ZTEDriver) PollONUs() ([]ONUData, error) {
	snmp := d.newSNMP()
	if err := snmp.Connect(); err != nil {
		return nil, fmt.Errorf("SNMP connect failed: %v", err)
	}
	defer snmp.Conn.Close()

	oids := d.getOIDs()
	platform := "C6xx"
	if d.isC3xx() {
		platform = "C3xx"
	}
	log.Printf("[ZTE/%s] Polling ONUs on %s (model: %s)", platform, d.target, d.model)

	// Step 1: Get PON port names for ifIndex → port name mapping
	ponPortMap := make(map[int]string) // ifIndex → port name
	results, err := snmp.WalkAll(oidIfName)
	if err != nil {
		log.Printf("[ZTE] Warning: ifName walk failed: %v", err)
	} else {
		for _, pdu := range results {
			name := pduToString(pdu)
			lower := strings.ToLower(name)
			if strings.Contains(lower, "gpon") || strings.Contains(lower, "pon_olt") || strings.Contains(lower, "pon-olt") || strings.Contains(lower, "gpon-olt") {
				ifIndex := extractLastOID(pdu.Name)
				ponPortMap[ifIndex] = name
			}
		}
	}
	log.Printf("[ZTE/%s] Found %d PON ports", platform, len(ponPortMap))

	// Step 2: Get ONU serial numbers — key data
	snMap := make(map[string]string) // "ifIndex.onuId" → SN
	results, err = snmp.WalkAll(oids.onuSerialNumber)
	if err != nil {
		return nil, fmt.Errorf("SN walk failed: %v", err)
	}
	for _, pdu := range results {
		ifIdx, onuId := extractTwoLastOIDs(pdu.Name)
		key := fmt.Sprintf("%d.%d", ifIdx, onuId)
		sn := pduToHexSN(pdu)
		if sn != "" {
			snMap[key] = sn
		}
	}
	log.Printf("[ZTE/%s] Found %d ONUs by SN", platform, len(snMap))

	// Step 3: Get ONU types
	typeMap := make(map[string]string)
	results, _ = snmp.WalkAll(oids.onuType)
	for _, pdu := range results {
		ifIdx, onuId := extractTwoLastOIDs(pdu.Name)
		key := fmt.Sprintf("%d.%d", ifIdx, onuId)
		typeMap[key] = pduToString(pdu)
	}

	// Step 4: Get ONU names
	nameMap := make(map[string]string)
	results, _ = snmp.WalkAll(oids.onuName)
	for _, pdu := range results {
		ifIdx, onuId := extractTwoLastOIDs(pdu.Name)
		key := fmt.Sprintf("%d.%d", ifIdx, onuId)
		nameMap[key] = pduToString(pdu)
	}

	// Step 5: Get phase state
	stateMap := make(map[string]string)
	results, _ = snmp.WalkAll(oids.onuPhaseState)
	for _, pdu := range results {
		ifIdx, onuId := extractTwoLastOIDs(pdu.Name)
		key := fmt.Sprintf("%d.%d", ifIdx, onuId)
		val := pduToInt(pdu)
		if s, ok := phaseStateMap[val]; ok {
			stateMap[key] = s
		} else {
			stateMap[key] = fmt.Sprintf("unknown(%d)", val)
		}
	}

	// Step 6: Get RX power — OID uses 3-part index: ifIndex.onuId.serviceIndex
	rxMap := make(map[string]float64)
	results, _ = snmp.WalkAll(oids.onuRxPower)
	for _, pdu := range results {
		parts := strings.Split(pdu.Name, ".")
		if len(parts) < 3 {
			continue
		}
		// Extract ifIndex and onuId (skip last part = serviceIndex)
		ifIdxStr := parts[len(parts)-3]
		onuIdStr := parts[len(parts)-2]
		ifIdx, _ := strconv.Atoi(ifIdxStr)
		onuId, _ := strconv.Atoi(onuIdStr)
		key := fmt.Sprintf("%d.%d", ifIdx, onuId)

		raw := pduToInt64(pdu)
		// TITAN algorithm for RX power conversion:
		// If val >= 0 && val <= 32767: val * 0.002 - 30
		// If val > 32767: (val - 65536) * 0.002 - 30
		var rxPower float64
		if raw >= 0 && raw <= 32767 {
			rxPower = float64(raw)*0.002 - 30
		} else if raw > 32767 {
			rxPower = float64(raw-65536)*0.002 - 30
		} else {
			rxPower = -40 // Invalid
		}
		rxMap[key] = rxPower
	}

	// Step 7: Get online/offline times
	onlineMap := make(map[string]string)
	offlineMap := make(map[string]string)
	results, _ = snmp.WalkAll(oids.onuLastOnlineTime)
	for _, pdu := range results {
		ifIdx, onuId := extractTwoLastOIDs(pdu.Name)
		key := fmt.Sprintf("%d.%d", ifIdx, onuId)
		onlineMap[key] = pduToDateTimeString(pdu)
	}
	results, _ = snmp.WalkAll(oids.onuLastOfflineTime)
	for _, pdu := range results {
		ifIdx, onuId := extractTwoLastOIDs(pdu.Name)
		key := fmt.Sprintf("%d.%d", ifIdx, onuId)
		offlineMap[key] = pduToDateTimeString(pdu)
	}

	// Build results
	var onus []ONUData
	for key, sn := range snMap {
		parts := strings.SplitN(key, ".", 2)
		if len(parts) != 2 {
			continue
		}
		ifIdx, _ := strconv.Atoi(parts[0])
		onuId, _ := strconv.Atoi(parts[1])

		ponPort := ponPortMap[ifIdx]
		if ponPort == "" {
			ponPort = ifIndexToPONPort(ifIdx)
		}

		onus = append(onus, ONUData{
			IfIndex:      ifIdx,
			OnuID:        onuId,
			SerialNumber: sn,
			Name:         nameMap[key],
			Type:         typeMap[key],
			PhaseState:   stateMap[key],
			RxPower:      rxMap[key],
			PONPort:      ponPort,
			OnlineTime:   onlineMap[key],
			OfflineTime:  offlineMap[key],
		})
	}

	return onus, nil
}

// --- Helpers ---

func extractLastOID(oid string) int {
	parts := strings.Split(oid, ".")
	if len(parts) == 0 {
		return 0
	}
	v, _ := strconv.Atoi(parts[len(parts)-1])
	return v
}

func extractTwoLastOIDs(oid string) (int, int) {
	parts := strings.Split(oid, ".")
	if len(parts) < 2 {
		return 0, 0
	}
	a, _ := strconv.Atoi(parts[len(parts)-2])
	b, _ := strconv.Atoi(parts[len(parts)-1])
	return a, b
}

func pduToString(pdu gosnmp.SnmpPDU) string {
	switch v := pdu.Value.(type) {
	case []byte:
		return string(v)
	case string:
		return v
	default:
		return ""
	}
}

func pduToInt(pdu gosnmp.SnmpPDU) int {
	switch v := pdu.Value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case uint:
		return int(v)
	case uint64:
		return int(v)
	case uint32:
		return int(v)
	case int32:
		return int(v)
	default:
		return 0
	}
}

func pduToInt64(pdu gosnmp.SnmpPDU) int64 {
	return gosnmp.ToBigInt(pdu.Value).Int64()
}

func pduToHexSN(pdu gosnmp.SnmpPDU) string {
	switch v := pdu.Value.(type) {
	case []byte:
		if len(v) == 0 {
			return ""
		}
		// Check if it's printable ASCII
		printable := true
		for _, b := range v {
			if b < 32 || b > 126 {
				printable = false
				break
			}
		}
		if printable {
			return strings.TrimSpace(string(v))
		}
		// Hex encode: first 4 bytes as ASCII vendor, rest as hex
		if len(v) >= 8 {
			vendor := string(v[:4])
			hex := fmt.Sprintf("%X", v[4:])
			return vendor + hex
		}
		return fmt.Sprintf("%X", v)
	case string:
		return strings.TrimSpace(v)
	default:
		return ""
	}
}

func pduToDateTimeString(pdu gosnmp.SnmpPDU) string {
	v, ok := pdu.Value.([]byte)
	if !ok || len(v) < 7 {
		return ""
	}
	year := int(v[0])<<8 + int(v[1])
	month := int(v[2])
	day := int(v[3])
	hour := int(v[4])
	min := int(v[5])
	sec := int(v[6])
	return fmt.Sprintf("%04d-%02d-%02d %02d:%02d:%02d", year, month, day, hour, min, sec)
}

func ifIndexToPONPort(ifIndex int) string {
	// ZTE ifIndex decomposition (works for both C3xx and C6xx)
	shelf := (ifIndex >> 16) & 0xFF
	slot := (ifIndex >> 8) & 0xFF
	port := ifIndex & 0xFF
	if shelf == 0 && slot == 0 && port == 0 {
		return fmt.Sprintf("ifIndex-%d", ifIndex)
	}
	return fmt.Sprintf("gpon_olt-%d/%d/%d", shelf, slot, port)
}

func formatUptime(ticks uint32) string {
	secs := ticks / 100
	days := secs / 86400
	secs %= 86400
	hours := secs / 3600
	secs %= 3600
	mins := secs / 60
	return fmt.Sprintf("%dd %dh %dm", days, hours, mins)
}

// ParsePONPort parses port name to slot/port
func ParsePONPort(name string) (slot, port int) {
	re := regexp.MustCompile(`(\d+)/(\d+)/(\d+)`)
	if m := re.FindStringSubmatch(name); len(m) >= 4 {
		slot, _ = strconv.Atoi(m[2])
		port, _ = strconv.Atoi(m[3])
	}
	return
}
