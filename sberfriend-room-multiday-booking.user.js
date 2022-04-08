// ==UserScript==
// @name         SberFriend room multiday booking
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Allows for booking conference rooms for repeating events
// @author       Ilya Nikishin <ianikishin@sberbank.ru>
// @downloadURL  https://github.com/half-public-tools/sberfriend-room-multiday-booking/raw/master/sberfriend-room-multiday-booking.user.js
// @updateURL    https://github.com/half-public-tools/sberfriend-room-multiday-booking/raw/master/sberfriend-room-multiday-booking.user.js
// @icon         https://github.com/half-public-tools/sberfriend-room-multiday-booking/raw/master/Icon.png
// @match        https://sberfriend.sbrf.ru/sberfriend/*
// @grant        none
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://raw.githubusercontent.com/uzairfarooq/arrive/master/minified/arrive.min.js
// @require      https://momentjs.com/downloads/moment.min.js
// @require      https://unpkg.com/xhook@1.4.9/dist/xhook.min.js
// ==/UserScript==


"use strict"
const DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ss'
const LOADER_ID = "repeatingLoader"
const INJECTED_IDS = [LOADER_ID, "countInput", "fileWarning", "multidayBookingSpinnerAnimationId"]

let isLoaded = false
let reqInterceptLock = false
let animationInjected = false
let days = 0
let successCard = null

const injectUI = () => {
    const datePicker = $("label:contains('Дата')").parent().parent()
    const countField = datePicker.clone().insertAfter(datePicker)
    countField.find('label').text('Повторения')
    countField.find('input')
        .attr('id', 'countInput')
        .attr('type', 'number')
        .attr('min', 0)
        .val(days)
        .on('change', e => { days = Number(e.target.value) })
    countField.find('button').parent().remove()

    $("a:contains('Выберите файл')")
        .parent()
        .parent()
        .parent()
        .append(`
            <div id="fileWarning" style="font-weight: bold; color: red; font-size: 16;">
                Файлы не прикрепятся к повторам мероприятия
            </div>
        `)
}

const injectSpinner = () => {
    $(document).arrive(
        '[data-fui-tid="FuiStatusCard"]',
        { existing: true, onceOnly: true },
        el => {
            successCard = el
            $(el).hide()
            $(el).parent().append(`<div id="${LOADER_ID}"></div>`)
            if (!animationInjected) {
                animationInjected = true
                $('body').append(`
                <style id="multidayBookingSpinnerAnimationId">
                    @keyframes multidayBookingSpinnerAnimation {
                        0% {transform: rotate(0deg);}
                        100% {transform: rotate(360deg);}
                    }
                </style>
            `)
            }
            $(`#${LOADER_ID}`)
                .css('width', '100%')
                .css('display', 'flex')
                .css('align-items', 'center')
                .css('flex-direction', 'column')
                .append('<div></div>')
                .append('<h5></h5>')
            $(`#${LOADER_ID}`)
                .find('div')
                .css('width', '88px')
                .css('height', '88px')
                .css('border-radius', '50%')
                .css('border-top', '8px solid rgba(255, 255, 255, 0.2)')
                .css('border-left', '8px solid rgba(255, 255, 255, 0.2)')
                .css('border-right', '8px solid rgba(255, 255, 255, 0.2)')
                .css('border-bottom', '8px solid rgba(255, 255, 255, 1)')
                .css('animation', 'multidayBookingSpinnerAnimation 1s infinite linear')
            $(`#${LOADER_ID}`)
                .find('h5')
                .css('margin-top', '28px')
                .addClass('MuiTypography-h5')
                .text('Создаются копии мероприятия')
        }
    )
}

const stopSpinner = () => {
    $(`#${LOADER_ID}`).hide()
    $(successCard).show()
    successCard = null
}

const handleSubmitResponse = (req, res) => {
    if (reqInterceptLock) return
    try {
        if (!req.body) return
        const reqBody = JSON.parse(req.body)
        if (!reqBody?.arg0?.length) return
        if (reqBody.arg0[0].params?.param0 !== 'ASUN_CREATE_CONFROOM_BOOKING_V1') return
        const reqData = JSON.parse(reqBody.arg0[0].params?.param1)

        const resBody = JSON.parse(res.data)
        if (!resBody?.object.length) return
        if (!!resBody.object[0]?.params?.error) return


        const origTimeFrom = reqData.booking.timeFrom
        const origTimeTo = reqData.booking.timeTo

        reqInterceptLock = true
        const promises = []
        injectSpinner()
        for (let i = 1; i <= days; i++) {
            const newTimeFrom = moment(origTimeFrom).add(i, 'days').format(DATE_FORMAT)
            const newTimeTo = moment(origTimeTo).add(i, 'days').format(DATE_FORMAT)

            const newReqData = { ...reqData }
            newReqData.booking.timeFrom = newTimeFrom
            newReqData.booking.timeTo = newTimeTo
            const newReqBody = { ...reqBody }
            newReqBody.arg0[0].params.param1 = JSON.stringify(newReqData)
            promises.push(
                $.ajax({
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    withCredentials: true,
                    dataType: req.dataType,
                    data: JSON.stringify(newReqBody),
                    xhrFields: {
                        withCredentials: true
                    },
                })
            )
        }
        Promise.all(promises).then(() => {
            stopSpinner()
            reqInterceptLock = false
        })
    } catch (e) { console.error(e) }
}

const load = () => {
    if (isLoaded) return
    isLoaded = true
    animationInjected = false
    days = 0
    successCard = null
    reqInterceptLock = false

    $(document).arrive(
        'button[type="submit"]',
        { onceOnly: true },
        () => {
            injectUI()
            xhook.after(handleSubmitResponse)
        }
    )
}

const unload = () => {
    if (!isLoaded) return
    INJECTED_IDS.forEach(id => $(`#${id}`).remove())
    isLoaded = false
}

const handleHashUpdate = () => {
    if (location.hash.startsWith('#/application/A51020482C6E4BFDE05323C6440AA466/new/booking')) {
        load()
    } else {
        unload()
    }
}

addEventListener('hashchange', handleHashUpdate)
handleHashUpdate()
