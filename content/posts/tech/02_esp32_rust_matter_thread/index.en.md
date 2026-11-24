---
author: Jan
date: '2026-11-24'
title: 'Matter over Thread in Rust?'
draft: true
---

Yes.

In 2024, I decided to build my own Matter devices to extend my smart home with functionality that I could not get from hardware vendors. I was annoyed by the slow adoption of what I thought was the better smart home standard. It was meant to get support from official systems like Google and Apple home, unlike many of the hobbyist or old-school systems based on Zigbee, or KNX.

I had absolutely no idea where I should start, but I found an the [Matter Arduino library from SiliconLabs](https://github.com/SiliconLabsSoftware/arduino/) and thought Arduino is a great start! I bought the [MGM240P](https://www.sparkfun.com/sparkfun-thing-plus-matter-mgm240p.html) and some sensors for it and got started. Thanks to an amazing [friend of mine](https://dazgupta.com) I was able to get something working within a few days and thought this is easy! I can do this! There was just one caveat: I spend roughly 30 Euros on the device and wanted to make more of these, and for that it had to be cheaper. The dev board I bought was just not going to work.

After a bit of research I stumbled across a fairly new library at the time to [bring matter](https://github.com/project-chip/rs-matter) support to embedded rust. I had already a few years under my belt with Rust and I felt way more comfortable with it then with Arduino or large C++ SDKs like the official matter-library. With some amazing support from the community (Mostly, [ivmarkov's embassy project](https://github.com/sysgrok/rs-matter-embassy)) I made progress. Slowly but steadily he helped me bring my project alive, and improve the library while we're at it. We [debugged issues with ESP32-H2](https://github.com/sysgrok/rs-matter-embassy/issues/13) together, [introduced better Sleepy End-Device support](https://github.com/sysgrok/rs-matter-embassy/issues/84) and in the end made my original goal a reality.

I now have a [battery powered soil moisture sensor](https://www.seeedstudio.com/XIAO-Soil-Sensor-p-6452.html) in my office which cost ~9 Euros per piece. The device should last between 1-2 years on a single AA cell and provide a reading every 6 hours.

The project is very similar to [automatous-io/xiao-soil-moisture-sensor-matter-thread](https://github.com/automatous-io/xiao-soil-moisture-sensor-matter-thread), I took the calibration and voltage reading code from the project as a starting point. I think we both discovered around the same time that the XIAO Soil Moisture Sensor is a great device to port to Matter due to the Thread supporting MCU on the board.

## The Overview

Device: [Seeed XIAO Soil Moisture Sensor kit](https://www.seeedstudio.com/XIAO-Soil-Sensor-p-6452.html) — a capacitive soil probe, three status LEDs, a button and an AA battery holder on a XIAO ESP32-C6 carrier (4 MB flash, external U.FL antenna). ~9 EUR per piece.

MCU: ESP32-C6 (32-bit RISC-V, runs at esp-hal's default 80 MHz preset) with an integrated 802.15.4 radio used for both Thread and BLE.

Sensors / inputs:
- Capacitive soil moisture probe, read via ADC on GPIO1 with excitation PWM on GPIO21
- Battery voltage via ADC on GPIO0 (single AA cell behind a TPS61021A boost converter to 3V3)
- User button on GPIO2 (active low)
- Three status LEDs on GPIO18/19/20 (yellow/green/red)

Libraries:
- [rs-matter](https://github.com/project-chip/rs-matter) + [rs-matter-embassy](https://github.com/sysgrok/rs-matter-embassy) (git master, pinned rev — the ICD/SED work is merged but unreleased): Matter stack, Thread driver with the ICD power-mode state machine, BLE via trouble
- [esp-hal](https://github.com/esp-rs/esp-hal) ~1.2, esp-rtos 0.4, [esp-radio](https://github.com/esp-rs/esp-radio) 1.0.0-beta.1 (802.15.4 Thread + BLE coexistence), esp-bootloader-esp-idf
- embassy-executor / -time / -futures / -sync (async runtime)
- sequential-storage + embedded-storage-async (Matter fabric/session persistence in flash)
- esp-println / esp-backtrace / esp-alloc, log, static_cell, portable-atomic

## What I learned

**Matter basics: commissioning via BLE.** A device joins the fabric over BLE while Thread comes up alongside it (concurrent commissioning), and after that everything rides on Thread/IPv6. With the test credentials (VID `0xFFF1`, PID `0x8010`) every ecosystem shows an "uncertified device" warning — expected, harmless. Fabrics and sessions persist in flash via `sequential-storage`, so a deep-sleep reboot comes back as the same commissioned device.

**Thread basics: what bit us.** Debugging with ivmarkov on the ESP32-H2 first ([#13](https://github.com/sysgrok/rs-matter-embassy/issues/13)), then on the C6: BLE advertisements never went on air in concurrent-commissioning mode ([#82](https://github.com/sysgrok/rs-matter-embassy/issues/82)) — that needed power-domain management in `esp-radio`/`esp-hal` ([esp-hal#6406](https://github.com/esp-rs/esp-hal/pull/6406)), because BLE and Thread share the radio and BLE must be able to come and go. SED support needed OpenThread changes ([esp-rs/openthread#121](https://github.com/esp-rs/openthread/pull/121), [#122](https://github.com/esp-rs/openthread/pull/122) for CSL on nRF). We debugged it with defmt logs over USB plus a Thread sniffer — the logs in [#84](https://github.com/sysgrok/rs-matter-embassy/issues/84) show the check-in being sent before the Thread network and SRP lookup were up, which was racy in Home Assistant.

**Protocol: SED, SIT vs LIT.** A Sleepy End Device tells its parent it keeps its receiver off and polls for queued frames. SIT (Short Idle Time, ≤ 15 s) suits actuators you expect to react; LIT (Long Idle Time, minutes) suits sensors like this one, where the controller registers for Check-Ins. The catch: LIT only deep-sleeps if the controller actually subscribes to check-ins — Google/Apple didn't support it yet, Samsung was beta-only, Home Assistant had a bug — so the device silently falls back to SIT and burns power.

**MCU: deep sleep vs light sleep.** On the ESP32-C6, deep sleep is a full chip reboot (only a timer stays powered), so everything must live in flash — it measures ~0.12 mA at the cell on this carrier (the chip itself is ~7 µA; the boost converter dominates). Light sleep keeps RAM but costs 35–180 µA, which is pointless for a LIT device: deep sleep == LIT, and it's only worth it because wake-ups are rare. Awake, the board pulls ~100 mA at the cell, so shaving the awake window matters ~25x more than shaving sleep current.

Setting up something new is now trivial: `rustup` + `espup` + `espflash` and one `cargo run` builds and flashes — no IDE, no SDK installer.



----------------------

Intro stub: I rewrote the C++ firmware for the Seeed XIAO soil moisture kit in
Rust (`no_std`, embassy, esp-hal, rs-matter-embassy) —
[repo](https://github.com/jan-xyz/xiao-soil-moisture-sensor-matter-thread-rs).
This post is about how that firmware is put together and what it taught me
about sleepy Matter devices on the ESP32.

> Disclaimer: like the C++ original, this uses Matter test credentials
> (vendor ID `0xFFF1`, product ID `0x8010`) and is not CSA-certified.
> Ecosystems warn about an uncertified device during commissioning — expected.

# Why this project

- cover: the C++ original (automatous-io/xiao-soil-moisture-sensor-matter-thread) worked — why rewrite in Rust
- cover: state of esp-hal + embassy in 2026, `no_std` on the ESP32-C6
- cover: what "pragmatic MVP, not full parity" means (see Known limitations)

# The hardware

- cover: XIAO ESP32-C6 carrier kit: capacitive probe, 3 status LEDs, button, single AA cell
- cover: the thing that bites: boost converter pulls ~100 mA at 3.3 V from a 1.5 V cell

# Architecture: behaviour as data

- cover: the layering from ARCHITECTURE.md: composition root → decision/integration layers → ports → device vs host `sim`
- cover: pitch in one sentence: push everything physical to the outside, treat behaviour as data
- cover: workspace layout `core` / `node` / `fw` / `sim`; `sim` is host-only, `default-members = ["fw"]`
- cover: what becomes testable without hardware (sampling cadence, report thresholds, gestures)

# Matter on top

- cover: rs-matter-embassy `light_thread_coex` shape: MatterStack over EmbassyThreadNetwork, BLE-concurrent commissioning
- cover: hand-written clusters: `SoilMeasurement` (moisture %) and `PowerSource` (battery %, voltage, estimated time remaining)
- cover: battery estimate from resting voltage per boot, any AA chemistry; errs on the empty side near the end (docs/battery.md)

# Sleepy end devices: SIT vs LIT

- cover: three things all called "sleep" (Thread SED role / radio off / MCU sleep) — ivmarkov's icd.md table
- cover: deep sleep == LIT (idle > 15 s); light sleep on ESP is inefficient (35–180 µA vs 7 µA deep sleep) and only serves SIT
- cover: on wake a LIT device re-sends all subscribed attributes anyway (no dataver persistence) → no flash writes needed to suppress unchanged reports
- cover: controller support caveat: LIT needs a Check-In client; Google/Apple not yet (Matter 1.5 pending), Samsung beta, HA buggy → falls back to SIT; links to rs-matter-embassy#84 and the matteralpha article
- cover: the check-in race I hit in Home Assistant (check-in sent before Thread/SRP is up) — logs in #84
- cover: measured results: ~0.12 mA asleep vs ~100 mA awake, 6 h LIT interval → >1 year on one AA cell; rejected dynamic sleep intervals (discharge ~linear, keep it simple)
- cover: the ICD state machine lives in rs-matter core (project-chip/rs-matter#579), not in downstream crates; BLE powers down when idle or it eats the savings (esp-hal#6406, openthread#121/#122)

![Cell voltage over several days: day/night cycles, spikes from USB flashing](images/battery-voltage-discharge.png "battery discharge curve at 900 s sleep cycles, 5 s active poll")

![Home Assistant voltage graph, 13–15 Nov](images/battery-voltage-home-assistant.png "reported cell voltage in Home Assistant at the 6 h LIT interval")

# Persistence and gestures

- cover: dry/wet calibration in its own flash partition, independent of Matter fabric persistence (factory reset ≠ recalibration)
- cover: button: single press = sample now, triple click = calibration flow, long hold = factory reset; also wakes from deep sleep
- cover: three LEDs: moisture classification, calibration feedback, error signals

# Build and flash traps

- cover: `rust-toolchain.toml`, `espflash.toml`, `partitions.csv`
- cover: what actually goes wrong on this platform (docs/building.md)

# Known limitations and what's next

- cover: no Matter OTA over Thread, no battery-sag/health measurement, no brownout diagnostics
- cover: LIT on controllers that don't implement it = SIT behaviour (short-idle polling, never deep-sleeps)
- cover: two fabrics is a trap (LIT as soon as either controller registers check-ins)
- cover: commands land at next wake-up (up to one idle period) — fine for a sensor, not for an actuator
- cover: idle period fixed at build time, on purpose
