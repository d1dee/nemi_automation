
const puppeteer = require('puppeteer')
const XLSX = require('xlsx');
(async () => {
    const browser = await puppeteer.launch({headless: true})
    const page = await browser.newPage()

    await page.setDefaultTimeout(50000)

    const navigationPromise = page.waitForNavigation()

    async function login() {
        await page.goto('http://nemis.education.go.ke/')

        await navigationPromise

        await page.focus('#Menu1')

        await page.setViewport({width: 1366, height: 665})


        await page.waitForSelector('#ctl00_ContentPlaceHolder1_Login1_UserName')
        await page.click('#ctl00_ContentPlaceHolder1_Login1_UserName')

        /* Change 'school code' to your school's nemis username */
        await page.keyboard.type('school code')

        await page.waitForSelector('#ctl00_ContentPlaceHolder1_Login1_Password')
        await page.click('#ctl00_ContentPlaceHolder1_Login1_Password')

        /* Change 'nemis password' to your school's password */
        await page.keyboard.type('nemis password')

        await page.waitForSelector('div > #aspnetForm > div > .row > .col-md-8')
        await page.click('div > #aspnetForm > div > .row > .col-md-8')

        await page.waitForSelector('#ctl00_ContentPlaceHolder1_Login1_LoginButton')
        await page.click('#ctl00_ContentPlaceHolder1_Login1_LoginButton')

        await navigationPromise

        await page.goto('http://nemis.education.go.ke/Admission/Listlearnersrep.aspx')

        await navigationPromise

        await page.click('#aspnetForm')

        await page.waitForSelector('#ctl00_ContentPlaceHolder1_SelectRecs')
        await page.select('#ctl00_ContentPlaceHolder1_SelectRecs', '1000')

        await navigationPromise

        //await page.focus('#ctl00_ContentPlaceHolder1_grdLearners')

    }


    try{
        await login()
    }
    catch (e) {
        console.log('Failed before getting to values retrying')
        await page.waitForTimeout(2000)
        await login()
    }

    await page.waitForTimeout(5000)

    let number_of_entries, excel_records
    let error_index = [], current_cell = [], index_nemis = [], excel_indexes = []
    let workbook = XLSX.readFile('./nemis.xlsx', {cellDates: true, dateNF: 'm/d/yy'})
    let first_sheet_name = workbook.SheetNames[0]

    /**********************************************************************************************
     * Getting the number of students in the excl file provided so as to avoid looping past file end
     */
    for (let i = 1;  i++; ) {
        let worksheet = workbook.Sheets[first_sheet_name]
        let cell = 'A' + i
        let desired_cell = worksheet[cell]
        let desired_value = (desired_cell ? desired_cell.w : undefined)
        /** -2 assumes that there is a row with heading in the file **/
        excel_records = i - 2
        if (desired_value === undefined) {
            break
        }
        else {
            excel_indexes.push(desired_value)
        }
    }
    /*****************************************************
     * Getting the number of students already admitted to the school
     */
    for (let i = 4; ;i++ ) {
        let html
        try {
            html = await page.$eval('div > #ctl00_ContentPlaceHolder1_grdLearners > tbody > .GridRow:nth-child(' +
                i + ') > td:nth-child(2)', e => e.innerHTML)
            if (html === undefined) {
                break
            }
            else {
                number_of_entries = i
                index_nemis.push(html)
            }
        } catch (e) {
            break
        }
    }

    /**********************************************************************************************************
     * Gets difference between nemis admitted students and excel files students and uses the difference to
     * admit new students
     */
    await admit()
    async function admit() {
        let not_admitted = excel_indexes.filter(x => !index_nemis.includes(x))
        console.log('Found the following student who are\'nt yet admitted', not_admitted)

        not_admitted.shift()

        try{
            for(let i = 1; i <= not_admitted.length; i++){
                await page.goto('http://nemis.education.go.ke/Learner/Studindex.aspx')

                await navigationPromise

                await page.waitForSelector('#txtSearch')
                await page.click('#txtSearch')

                await page.keyboard.type(not_admitted[i].toString())
                console.log('admitting student',not_admitted[i])

                await page.waitForSelector('#SearchCmd')
                await page.click('#SearchCmd')

                await page.waitForTimeout(2000)


                await page.waitForSelector('#BtnAdmit')
                await page.click('#BtnAdmit')

                await page.waitForSelector('#ctl00_ContentPlaceHolder1_UpdatePanel1 > table > tbody > tr:nth-child(3) > td')

                await page.waitForTimeout(3000)

                const admitted = await page.$eval('#ctl00_ContentPlaceHolder1_UpdatePanel1 > table > tbody > tr:nth-child(3) > td',
                    e => e.innerHTML)

                let regex = /THE STUDENT HAS BEEN ADMITTED TO THE SCHOOL.*/gim
                if( regex.test(admitted) === true ){
                    console.log(admitted)

                }
                else{
                    console.log("Admission failed for index: ",not_admitted[i])
                }

            }

        }
        catch (e) {
        }

        await excel()

    }


    /***********************************************************************************************************
     * checks values and matches indexes before calling input function
     * @param current_cell[]
     */

    async function sanity_check(current_cell) {
        let index_number = current_cell[0]
        /******
         if (index_number === error_index[0])
         error_index.forEach(e => {
                console.log(index_number, 'has issue, already pushed to error_index array')
            })
         **********/
        try {
            for (let i = 4; i < number_of_entries; ) {
                /******************************************************
                 * a necessary loop to compare all values with admitted students
                 */
                const nemis_indexes = await page.$eval('div > #ctl00_ContentPlaceHolder1_grdLearners > tbody > .GridRow:nth-child('
                    + i + ') > td:nth-child(2)', e => e.innerHTML)
                if (nemis_indexes === index_number) {
                    try {
                        const upi = await page.$eval('div > #ctl00_ContentPlaceHolder1_grdLearners > tbody > .GridRow:nth-child('
                            + i + ') > td:nth-child(8)', e => e.innerHTML)
                        if (upi != '&nbsp') {
                            break
                        } else {
                            await input(current_cell, i)

                            break
                        }
                    } catch (e) {
                        break
                    }
                } else {
                    i++
                }
            }
        } catch (e) {
            console.log('Timeout on', index_number, '.... adding to error index')
            error_index.push(index_number)

            await page.waitForTimeout(2000)

            await page.goBack()

            await navigationPromise

        }

    }

    /******************************************************************************************
     * get input values from given excel file
     * @returns {Promise<void>}
     */

    async function excel() {
        await page.goto('http://nemis.education.go.ke/Admission/Listlearnersrep.aspx')

        await navigationPromise

        let address_of_cell
        for (let i = 1; i <= excel_records; ) {
            const alphabets = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']
            alphabets.forEach(element => {
                address_of_cell = element + i

                /* Get worksheet */
                let worksheet = workbook.Sheets[first_sheet_name]

                /* Find desired cell */
                let desired_cell = worksheet[address_of_cell]

                /* Get the value */
                let desired_value = (desired_cell ? desired_cell.w : undefined)
                current_cell.push(desired_value)

            })
            await sanity_check(current_cell)
            current_cell = []
            i++
        }
    }

    async function input(current_cell, nemis_grid) {

        await navigationPromise

        let index_number = current_cell[0].toString(), f_name = current_cell[1].toString(),
            m_name = current_cell[2].toString(),
            l_name = current_cell[3].toString(),
            birth_no = current_cell[4].toString(), dob = current_cell[5], county = current_cell[6].toString(),
            sub_county = current_cell[7].toString(),
            address = current_cell[8].toString(), mothers_name = current_cell[9].toString(),
            mothers_id = current_cell[10].toString(),
            mothers_tel = current_cell[11].toString(), fathers_name = current_cell[12].toString(),
            fathers_id = current_cell[13].toString(),
            fathers_tel = current_cell[14].toString()

        dob = (dob.toLocaleString('en-US').slice(0, 10).replace(',', ''))

        /******************************************************
         *nemis seems to be using county number for their query instead of the actual county name
         */
        let county_number
        let sub_county_no
        switch (true) {
            /***********************************************
             * regex was the best we can do to avoid typo in excel
             *
             * **********************************************/
            case /^momb.*/ig.test(county):
                county_number = 1
                switch (true) {
                    case /^chang.*/ig.test(sub_county):
                        sub_county_no = 1198
                        break
                    case /^jom.*/ig.test(sub_county):
                        sub_county_no = 1199
                        break
                    case /^kis.*/ig.test(sub_county):
                        sub_county_no = 1200
                        break
                    case /^lik.*/ig.test(sub_county):
                        sub_county_no = 1201
                        break
                    case /^mv.*/ig.test(sub_county):
                        sub_county_no = 1202
                        break
                    case /^momb.*/ig.test(sub_county):
                        sub_county_no = 1202
                        break
                    case /^nya.*/ig.test(sub_county):
                        sub_county_no = 1203
                        break
                    default:
                        sub_county_no = 1202
                        break
                }
                break

            case /^kwa.*/ig.test(county):
                county_number = 2
                switch (true) {
                    case /^kin.*/ig.test(sub_county):
                        sub_county_no = 1139
                        break
                    case /^lu.*/ig.test(sub_county):
                        sub_county_no = 1141
                        break
                    case /^msa.*/ig.test(sub_county):
                        sub_county_no = 1142
                        break
                    case /^ma.*/ig.test(sub_county):
                        sub_county_no = 1328
                        break
                    case /^sa.*/ig.test(sub_county):
                        sub_county_no = 1330
                        break
                    default:
                        sub_county_no = 1141
                        break
                }
                break

            case /kili.*/ig.test(county):
                county_number = 3
                switch (true) {
                    case /^bah.*/ig.test(sub_county):
                        sub_county_no = 1094
                        break
                    case /^kil.*/ig.test(sub_county):
                        sub_county_no = 1094
                        break

                    case /^gan.*/ig.test(sub_county):
                        sub_county_no = 1095
                        break
                    case /^kal.*/ig.test(sub_county):
                        sub_county_no = 1096
                        break
                    case /^mag.*/ig.test(sub_county):
                        sub_county_no = 1098
                        break
                    case /^mal.*/ig.test(sub_county):
                        sub_county_no = 1099
                        break
                    case /^ra.*/ig.test(sub_county):
                        sub_county_no = 1100
                        break
                    default:
                        sub_county_no = 1099
                        break

                }
                break
            case /^tana.*/ig.test(county):
                county_number = 4
                switch (true) {
                    case /^bu.*/ig.test(sub_county):
                        sub_county_no = 1279
                        break
                    case /^ta.*rth$/igm.test(sub_county):
                        sub_county_no = 1279
                        break
                    case /^ta.*ta$/igm.test(sub_county):
                        sub_county_no = 1280
                        break
                    case /^ta.*r$/igm.test(sub_county):
                        sub_county_no = 1281
                        break
                    default:
                        sub_county_no = 1279
                }
                break

            case /^lam.*/ig.test(county):
                county_number = 5
                switch (true) {
                    case /^l.*ast$/igm.test(sub_county):
                        sub_county_no = 1148
                        break
                    case /^l.*est$/igm.test(sub_county):
                        sub_county_no = 1149
                        break
                    default:
                        sub_county_no = 1448
                }
                break

            case /^tait.*/ig.test(county):
                county_number = 6
                switch (true) {
                    case /^.*/ig.test(sub_county):
                        sub_county_no = 1275
                        break
                    case /^mwa.*/ig.test(sub_county):
                        sub_county_no = 1276
                        break
                    case /^tav.*/ig.test(sub_county):
                        sub_county_no = 1277
                        break
                    case /^wu.*/ig.test(sub_county):
                        sub_county_no = 1278
                        break
                    case /^tai.*/ig.test(sub_county):
                        sub_county_no = 1278
                        break
                    default:
                        sub_county_no = 1277
                }
                break

            case /^gar.*/ig.test(county):
                county_number = 7
                switch (true) {
                    case /^ba.*/ig.test(sub_county):
                        sub_county_no = 1038
                        break
                    case /^da.*/ig.test(sub_county):
                        sub_county_no = 1039
                        break
                    case /^fa.*/ig.test(sub_county):
                        sub_county_no = 1040
                        break
                    case /^gar.*/ig.test(sub_county):
                        sub_county_no = 1041
                        break
                    case /^hu.*/ig.test(sub_county):
                        sub_county_no = 1042
                        break
                    case /^ij.*/ig.test(sub_county):
                        sub_county_no = 1043
                        break
                    case /^la.*/ig.test(sub_county):
                        sub_county_no = 1044
                        break
                    default:
                        sub_county_no = 1041
                        break
                }
                break

            case /^waj.*/ig.test(county):
                county_number = 8
                switch (true) {
                    case /^bu.*/ig.test(sub_county):
                        sub_county_no = 1309
                        break
                    case /^eld.*/ig.test(sub_county):
                        sub_county_no = 1310
                        break
                    case /^hab.*/ig.test(sub_county):
                        sub_county_no = 1311
                        break
                    case /^tar.*/ig.test(sub_county):
                        sub_county_no = 1312
                        break
                    case /^wa.*ast$/igm.test(sub_county):
                        sub_county_no = 1313
                        break
                    case /^wa.*rth$/igm.test(sub_county):
                        sub_county_no = 1314
                        break
                    case /^w.*uth$/igm.test(sub_county):
                        sub_county_no = 1315
                        break
                    case /^w.*est$/igm.test(sub_county):
                        sub_county_no = 1316
                        break
                    default:
                        sub_county_no = 1313
                        break
                }
                break

            case /^mand.*/ig.test(county):
                county_number = 9
                switch (true) {
                    case /^ba.*/ig.test(sub_county):
                        sub_county_no = 1167
                        break
                    case /^la.*/ig.test(sub_county):
                        sub_county_no = 1168
                        break
                    case /^m.*ral$/igm.test(sub_county):
                        sub_county_no = 1169
                        break
                    case /^m.*ast/igm.test(sub_county):
                        sub_county_no = 1170
                        break
                    case /^m.*rth/igm.test(sub_county):
                        sub_county_no = 1171
                        break
                    case /^m.*est/igm.test(sub_county):
                        sub_county_no = 1172
                        break
                    case /^ko.*/ig.test(sub_county):
                        sub_county_no = 1322
                        break
                    case /^ar.*/ig.test(sub_county):
                        sub_county_no = 1323
                        break
                    case /^ki.*/ig.test(sub_county):
                        sub_county_no = 1324
                        break
                    default:
                        sub_county_no = 1169
                        break
                }
                break

            case /^mars.*/ig.test(county):
                county_number = 10
                switch (true) {
                    case /^cha.*/ig.test(sub_county):
                        sub_county_no = 1173
                        break
                    case /^h.*rth$/igm.test(sub_county):
                        sub_county_no = 1174
                        break
                    case /^loi.*/ig.test(sub_county):
                        sub_county_no = 1175
                        break
                    case /^mar.*/ig.test(sub_county):
                        sub_county_no = 1176
                        break
                    case /^lai.*/ig.test(sub_county):
                        sub_county_no = 1177
                        break
                    case /^m.*th$/ig.test(sub_county):
                        sub_county_no = 1177
                        break
                    case /^mo.*/ig.test(sub_county):
                        sub_county_no = 1178
                        break
                    case /^so.*/ig.test(sub_county):
                        sub_county_no = 1179
                        break
                    default:
                        sub_county_no = 1178
                        break
                }
                break

            case /^isi.*/ig.test(county):
                county_number = 11
                switch (true) {
                    case /^g.*/ig.test(sub_county):
                        sub_county_no = 1053
                        break
                    case /^i.*/ig.test(sub_county):
                        sub_county_no = 1054
                        break
                    case /^m.*/ig.test(sub_county):
                        sub_county_no = 1055
                        break
                    default:
                        sub_county_no = 1054

                }
                break

            case /^meru.*/ig.test(county):
                county_number = 12
                switch (true) {
                    case /^b.*/ig.test(sub_county):
                        sub_county_no = 1180
                        break
                    case /^ig.*ral$/igm.test(sub_county):
                        sub_county_no = 1181
                        break
                    case /^ig.*rth$/igm.test(sub_county):
                        sub_county_no = 1182
                        break
                    case /^ig.*uth$/igm.test(sub_county):
                        sub_county_no = 1183
                        break
                    case /^im.*rth$/igm.test(sub_county):
                        sub_county_no = 1184
                        break
                    case /^im.*uth$/igm.test(sub_county):
                        sub_county_no = 1185
                        break
                    case /^m.*al$/igm.test(sub_county):
                        sub_county_no = 1186
                        break
                    case /^ti.*al$/igm.test(sub_county):
                        sub_county_no = 1187
                        break
                    case /^t.*ast$/igm.test(sub_county):
                        sub_county_no = 1188
                        break
                    case /^t.*est$/igm.test(sub_county):
                        sub_county_no = 1189
                        break
                    default:
                        sub_county_no = 1186

                }
                break

            case /^thar.*/ig.test(county):
                county_number = 13
                switch (true) {
                    case /^ma.*/ig.test(sub_county):
                        sub_county_no = 1282
                        break
                    case /^me.*/ig.test(sub_county):
                        sub_county_no = 1283
                        break
                    case /^t.*rth/igm.test(sub_county):
                        sub_county_no = 1284
                        break
                    case /^t.*uth/igm.test(sub_county):
                        sub_county_no = 1285
                        break
                    default:
                        sub_county_no = 1283
                        break

                }
                break

            case /^emb.*/ig.test(county):
                county_number = 14
                switch (true) {
                    case /^e.*ast$/igm.test(sub_county):
                        sub_county_no = 1033
                        break
                    case /^e.*rth$/igm.test(sub_county):
                        sub_county_no = 1034
                        break
                    case /^e.*est*/igm.test(sub_county):
                        sub_county_no = 1035
                        break
                    case /^m.*rth$/igm.test(sub_county):
                        sub_county_no = 1036
                        break
                    case /^m.*uth$/igm.test(sub_county):
                        sub_county_no = 1037
                        break
                    default:
                        sub_county_no = 1034
                }
                break

            case /^kit.*/ig.test(county):
                county_number = 15
                switch (true) {
                    case /^i.*/ig.test(sub_county):
                        sub_county_no = 1123
                        break
                    case /^ka.*/ig.test(sub_county):
                        sub_county_no = 1124
                        break
                    case /^ki.*i$/ig.test(sub_county):
                        sub_county_no = 1125
                        break
                    case /^k.*l$/igm.test(sub_county):
                        sub_county_no = 1126
                        break
                    case /^k.*t$/igm.test(sub_county):
                        sub_county_no = 1127
                        break
                    case /^kv.*/ig.test(sub_county):
                        sub_county_no = 1128
                        break
                    case /^l.*a$/igm.test(sub_county):
                        sub_county_no = 1129
                        break
                    case /^ma.*/ig.test(sub_county):
                        sub_county_no = 1130
                        break
                    case /^mum.*/ig.test(sub_county):
                        sub_county_no = 1131
                        break
                    case /^muti.*/ig.test(sub_county):
                        sub_county_no = 1132
                        break
                    case /^muto.*/ig.test(sub_county):
                        sub_county_no = 1133
                        break
                    case /^m.*l$/igm.test(sub_county):
                        sub_county_no = 1134
                        break
                    case /^m.*ast$/igm.test(sub_county):
                        sub_county_no = 1135
                        break
                    case /^m.*est$/igm.test(sub_county):
                        sub_county_no = 1136
                        break
                    case /^mi.*/ig.test(sub_county):
                        sub_county_no = 1136
                        break
                    case /^nz.*/ig.test(sub_county):
                        sub_county_no = 1137
                        break
                    case /^tse.*/ig.test(sub_county):
                        sub_county_no = 1138
                        break
                    default:
                        sub_county_no = 1126
                        break
                }
                break

            case /^mach.*/ig.test(county):
                county_number = 16
                switch (true) {
                    case /^a.*r$/igm.test(sub_county):
                        sub_county_no = 1150
                        break
                    case /^kan.*/ig.test(sub_county):
                        sub_county_no = 1151
                        break
                    case /^kat.*/ig.test(sub_county):
                        sub_county_no = 1152
                        break
                    case /^mach.*/ig.test(sub_county):
                        sub_county_no = 1153
                        break
                    case /^mas.*/ig.test(sub_county):
                        sub_county_no = 1154
                        break
                    case /^mat.*/ig.test(sub_county):
                        sub_county_no = 1155
                        break
                    case /^mw.*/ig.test(sub_county):
                        sub_county_no = 1156
                        break
                    case /^v.*/ig.test(sub_county):
                        sub_county_no = 1157
                        break
                    case /^kal.*/ig.test(sub_county):
                        sub_county_no = 1325
                        break
                    default:
                        sub_county_no = 1153
                        break
                }
                break

            case /^mak.*/ig.test(county):
                county_number = 17
                switch (true) {
                    case /^kat.*/ig.test(sub_county):
                        sub_county_no = 1158
                        break
                    case /^kib.*/ig.test(sub_county):
                        sub_county_no = 1159
                        break
                    case /^kil.*/ig.test(sub_county):
                        sub_county_no = 1160
                        break
                    case /^m.*u$/ig.test(sub_county):
                        sub_county_no = 1161
                        break
                    case /^m.*i$/ig.test(sub_county):
                        sub_county_no = 1162
                        break
                    case /^m.*ast$/igm.test(sub_county):
                        sub_county_no = 1163
                        break
                    case /^m.*est$/igm.test(sub_county):
                        sub_county_no = 1164
                        break
                    case /^muk.*/ig.test(sub_county):
                        sub_county_no = 1165
                        break
                    case /^nz.*/ig.test(sub_county):
                        sub_county_no = 1166
                        break
                    default:
                        sub_county_no = 1159
                        break
                }
                break

            case /^nyan.*/ig.test(county):
                county_number = 18
                switch (true) {
                    case /^k.*/ig.test(sub_county):
                        sub_county_no = 1139
                        break
                    case /^l.*a$/igm.test(sub_county):
                        sub_county_no = 1141
                        break
                    case /^ms.*/ig.test(sub_county):
                        sub_county_no = 1142
                        break
                    case /^ma.*/ig.test(sub_county):
                        sub_county_no = 1328
                        break
                    case /^sa.*/ig.test(sub_county):
                        sub_county_no = 1330
                        break
                    default:
                        sub_county_no = 1330

                }
                break

            case /^nyer.*/ig.test(county):
                county_number = 19
                switch (true) {
                    case /^k.*ast$/igm.test(sub_county):
                        sub_county_no = 1258
                        break
                    case /^k.*est$/igm.test(sub_county):
                        sub_county_no = 1259
                        break
                    case /^m.*ast$/igm.test(sub_county):
                        sub_county_no = 1260
                        break
                    case /^m.*est$/igm.test(sub_county):
                        sub_county_no = 1261
                        break
                    case /^muk.*/igm.test(sub_county):
                        sub_county_no = 1262
                        break
                    case /^n.*l$/igm.test(sub_county):
                        sub_county_no = 1263
                        break
                    case /^n.*th$/igm.test(sub_county):
                        sub_county_no = 1264
                        break
                    case /^t.*/ig.test(sub_county):
                        sub_county_no = 1265
                        break
                    default:
                        sub_county_no = 1258
                        break
                }
                break

            case /^kiri.*/ig.test(county):
                county_number = 20
                switch (true) {
                    case /^k.*l$/igm.test(sub_county):
                        sub_county_no = 1101
                        break
                    case /^k.*ast$/igm.test(sub_county):
                        sub_county_no = 1102
                        break
                    case /^k.*est$/igm.test(sub_county):
                        sub_county_no = 1103
                        break
                    case /^m.*ast$/igm.test(sub_county):
                        sub_county_no = 1104
                        break
                    case /^m.*est$/igm.test(sub_county):
                        sub_county_no = 1105
                        break
                    default:
                        sub_county_no = 1103
                }
                break

            case /^mura.*/ig.test(county):
                county_number = 21
                switch (true) {
                    case /^gat.*/ig.test(sub_county):
                        sub_county_no = 1204
                        break
                    case /^kah.*/ig.test(sub_county):
                        sub_county_no = 1205
                        break
                    case /^kand.*/ig.test(sub_county):
                        sub_county_no = 1206
                        break
                    case /^kang.*/ig.test(sub_county):
                        sub_county_no = 1207
                        break
                    case /^kig.*/ig.test(sub_county):
                        sub_county_no = 1208
                        break
                    case /^ma.*/ig.test(sub_county):
                        sub_county_no = 1209
                        break
                    case /^m.*ast$/igm.test(sub_county):
                        sub_county_no = 1210
                        break
                    case /^m.*uth$/igm.test(sub_county):
                        sub_county_no = 1211
                        break
                    default:
                        sub_county_no = 1204
                        break
                }
                break

            case /^kiam.*/ig.test(county):
                county_number = 22
                switch (true) {
                    case /^g.*rth$/img.test(sub_county):
                        sub_county_no = 1081
                        break
                    case /^g.*uth$/igm.test(sub_county):
                        sub_county_no = 1082
                        break
                    case /^gi.*/ig.test(sub_county):
                        sub_county_no = 1083
                        break
                    case /^ju.*/ig.test(sub_county):
                        sub_county_no = 1084
                        break
                    case /^kab.*/ig.test(sub_county):
                        sub_county_no = 1085
                        break
                    case /^kiamba.*/ig.test(sub_county):
                        sub_county_no = 1086
                        break
                    case /^kiambu.*/ig.test(sub_county):
                        sub_county_no = 1087
                        break
                    case /^kik.*/ig.test(sub_county):
                        sub_county_no = 1088
                        break
                    case /^la.*/ig.test(sub_county):
                        sub_county_no = 1089
                        break
                    case /^li.*/ig.test(sub_county):
                        sub_county_no = 1090
                        break
                    case /^ru.*/ig.test(sub_county):
                        sub_county_no = 1091
                        break
                    case /^t.*ast$/igm.test(sub_county):
                        sub_county_no = 1092
                        break
                    case /^t.*est$/igm.test(sub_county):
                        sub_county_no = 1093
                        break
                    default:
                        sub_county_no = 1084
                        break
                }
                break

            case /^tur.*/ig.test(county):
                county_number = 23
                switch (true) {
                    case /^k.*/ig.test(sub_county):
                        sub_county_no = 1291
                        break
                    case /^l.*/ig.test(sub_county):
                        sub_county_no = 1292
                        break
                    case /^t.*l$/igm.test(sub_county):
                        sub_county_no = 1293
                        break
                    case /^t.*ast$/igm.test(sub_county):
                        sub_county_no = 1294
                        break
                    case /^t.*rth$/igm.test(sub_county):
                        sub_county_no = 1295
                        break
                    case /^t.*uth$/igm.test(sub_county):
                        sub_county_no = 1296
                        break
                    case /^t.*est$/igm.test(sub_county):
                        sub_county_no = 1297
                        break
                    default:
                        sub_county_no = 1293
                        break
                }
                break

            case /^west.*/ig.test(county):
                county_number = 24
                switch (true) {
                    case /^ki.*/ig.test(sub_county):
                        sub_county_no = 1317
                        break
                    case /^p.*al$/igm.test(sub_county):
                        sub_county_no = 1318
                        break
                    case /^p.*rth$/igm.test(sub_county):
                        sub_county_no = 1319
                        break
                    case /^p.*uth$/igm.test(sub_county):
                        sub_county_no = 1320
                        break
                    case /^w.*ot$/igm.test(sub_county):
                        sub_county_no = 1321
                        break
                    default:
                        sub_county_no = 1320
                        break
                }
                break

            case /^samb.*/ig.test(county):
                county_number = 25
                switch (true) {
                    case /^sa.*al$/igm.test(sub_county):
                        sub_county_no = 1266
                        break
                    case /^sa.*ast$/igm.test(sub_county):
                        sub_county_no = 1267
                        break
                    case /^sa.*rth$/igm.test(sub_county):
                        sub_county_no = 1268
                        break
                    default:
                        sub_county_no = 1266
                        break
                }
                break

            case /^trans.*/ig.test(county):
                county_number = 26
                switch (true) {
                    case /^e.*/ig.test(sub_county):
                        sub_county_no = 1286
                        break
                    case /^ki.*/ig.test(sub_county):
                        sub_county_no = 1287
                        break
                    case /^kw.*/ig.test(sub_county):
                        sub_county_no = 1288
                        break
                    case /^t.*ast$/igm.test(sub_county):
                        sub_county_no = 1289
                        break
                    case /^s.*/ig.test(sub_county):
                        sub_county_no = 1290
                        break
                    case /^t.*est$/igm.test(sub_county):
                        sub_county_no = 1290
                        break
                    default:
                        sub_county_no = 1289
                }
                break

            case /^uas.*/ig.test(county):
                county_number = 27
                switch (true) {
                    case /^e.*ast$/igm.test(sub_county):
                        sub_county_no = 1298
                        break
                    case /^a.*/ig.test(sub_county):
                        sub_county_no = 1298
                        break
                    case /^e.*est$/igm.test(sub_county):
                        sub_county_no = 1299
                        break
                    case /^k.*/ig.test(sub_county):
                        sub_county_no = 1300
                        break
                    case /^mo.*/ig.test(sub_county):
                        sub_county_no = 1301
                        break
                    case /^s.*/ig.test(sub_county):
                        sub_county_no = 1302
                        break
                    case /^wa.*/ig.test(sub_county):
                        sub_county_no = 1303
                        break
                    case /^ka.*/ig.test(sub_county):
                        sub_county_no = 1303
                        break
                    default:
                        sub_county_no = 1299
                        break
                }
                break

            case /^elg.*/ig.test(county):
                county_number = 28
                switch (true) {
                    case /^k.*rth$/igm.test(sub_county):
                        sub_county_no = 1029
                        break
                    case /^k.*uth$/igm.test(sub_county):
                        sub_county_no = 1030
                        break
                    case /^m.*ast$/igm.test(sub_county):
                        sub_county_no = 1031
                        break
                    case /^m.*est$/igm.test(sub_county):
                        sub_county_no = 1032
                        break
                    default:
                        sub_county_no = 1031
                        break
                }
                break

            case /^nand.*/ig.test(county):
                county_number = 29
                switch (true) {
                    case /^c.*/ig.test(sub_county):
                        sub_county_no = 1234
                        break
                    case /^n.*al$/igm.test(sub_county):
                        sub_county_no = 1235
                        break
                    case /^n.*ast$/igm.test(sub_county):
                        sub_county_no = 1236
                        break
                    case /^n.*rth$/igm.test(sub_county):
                        sub_county_no = 1237
                        break
                    case /^n.*uth$/igm.test(sub_county):
                        sub_county_no = 1238
                        break
                    case /^t.*/ig.test(sub_county):
                        sub_county_no = 1239
                        break
                    default:
                        sub_county_no = 1235
                        break
                }
                break

            case /^bar.*/ig.test(county):
                county_number = 30
                switch (true) {
                    case /^b.*l$/igm.test(sub_county):
                        sub_county_no = 1001
                        break
                    case /^b.*h$/igm.test(sub_county):
                        sub_county_no = 1002
                        break
                    case /^t.*est$/ig.test(sub_county):
                        sub_county_no = 1003
                        break
                    case /^e.*t$/igm.test(sub_county):
                        sub_county_no = 1003
                        break
                    case /^k.*/ig.test(sub_county):
                        sub_county_no = 1004
                        break
                    case /^ma.*/ig.test(sub_county):
                        sub_county_no = 1005
                        break
                    case /^mo.*/ig.test(sub_county):
                        sub_county_no = 1006
                        break
                    case /^t.*ast$/igm.test(sub_county):
                        sub_county_no = 1331
                        break
                    default:
                        sub_county_no = 1001
                        break
                }
                break

            case /^laik.*/ig.test(county):
                county_number = 31
                switch (true) {
                    case /^l.*l$/img.test(sub_county):
                        sub_county_no = 1143
                        break
                    case /^l.*ast$/igm.test(sub_county):
                        sub_county_no = 1144
                        break
                    case /^l.*rth$/igm.test(sub_county):
                        sub_county_no = 1145
                        break
                    case /^l.*est$/igm.test(sub_county):
                        sub_county_no = 1146
                        break
                    case /^n.*/ig.test(sub_county):
                        sub_county_no = 1147
                        break
                    default:
                        sub_county_no = 1143
                        break
                }
                break

            case /^nak.*/ig.test(county):
                county_number = 32
                switch (true) {
                    case /^g.*/ig.test(sub_county):
                        sub_county_no = 1223
                        break
                    case /^k.*/ig.test(sub_county):
                        sub_county_no = 1224
                        break
                    case /^molo.*/ig.test(sub_county):
                        sub_county_no = 1226
                        break
                    case /^n.*a$/ig.test(sub_county):
                        sub_county_no = 1227
                        break
                    case /^n.*u$/ig.test(sub_county):
                        sub_county_no = 1228
                        break
                    case /^n.*rth$/igm.test(sub_county):
                        sub_county_no = 1229
                        break
                    case /^n.*est$/igm.test(sub_county):
                        sub_county_no = 1230
                        break
                    case /^nj.*/ig.test(sub_county):
                        sub_county_no = 1231
                        break
                    case /^r.*/ig.test(sub_county):
                        sub_county_no = 1232
                        break
                    case /^s.*/ig.test(sub_county):
                        sub_county_no = 1233
                        break
                    default:
                        sub_county_no = 1228
                        break
                }
                break

            case /^nar.*/ig.test(county):
                county_number = 33
                switch (true) {
                    case /^n.*ast$/igm.test(sub_county):
                        sub_county_no = 1240
                        break
                    case /^n.*rth$/igm.test(sub_county):
                        sub_county_no = 1241
                        break
                    case /^n*uth$/igm.test(sub_county):
                        sub_county_no = 1242
                        break
                    case /^n.*est$/igm.test(sub_county):
                        sub_county_no = 1243
                        break
                    case /^t.*ast$/igm.test(sub_county):
                        sub_county_no = 1244
                        break
                    case /^t.*est$/igm.test(sub_county):
                        sub_county_no = 1245
                        break
                    default:
                        sub_county_no = 1241
                        break
                }
                break

            case /^kaji.*/ig.test(county):
                county_number = 34
                switch (true) {
                    case /^b.*/ig.test(sub_county):
                        sub_county_no = 1062
                        break
                    case /^k.*l$/igm.test(sub_county):
                        sub_county_no = 1063
                        break
                    case /^k.*ast$/igm.test(sub_county):
                        sub_county_no = 1064
                        break
                    case /^k.*rth$/igm.test(sub_county):
                        sub_county_no = 1065
                        break
                    case /^k.*uth$/igm.test(sub_county):
                        sub_county_no = 1066
                        break
                    case /^kh.*/ig.test(sub_county):
                        sub_county_no = 1067
                        break
                    case /^li.*/ig.test(sub_county):
                        sub_county_no = 1068
                        break
                    case /^lu.*/ig.test(sub_county):
                        sub_county_no = 1069
                        break
                    case /^mate.*/ig.test(sub_county):
                        sub_county_no = 1070
                        break
                    case /^matu.*/ig.test(sub_county):
                        sub_county_no = 1071
                        break
                    case /^mu.*/ig.test(sub_county):
                        sub_county_no = 1072
                        break
                    case /^mu.*t$/ig.test(sub_county):
                        sub_county_no = 1073
                        break
                    case /^n.*/ig.test(sub_county):
                        sub_county_no = 1074
                        break
                    default:
                        sub_county_no = 1062
                        break
                }
                break

            case /^ker.*/ig.test(county):
                county_number = 35
                switch (true) {
                    case /^be.*/ig.test(sub_county):
                        sub_county_no = 1075
                        break
                    case /^bu.*/ig.test(sub_county):
                        sub_county_no = 1076
                        break
                    case /^ke.*/ig.test(sub_county):
                        sub_county_no = 1077
                        break
                    case /^ki.*/ig.test(sub_county):
                        sub_county_no = 1078
                        break
                    case /^lo.*/ig.test(sub_county):
                        sub_county_no = 1079
                        break
                    case /^s.*/ig.test(sub_county):
                        sub_county_no = 1080
                        break
                    default:
                        sub_county_no = 1077
                        break
                }
                break

            case /^bome.*/ig.test(county):
                county_number = 36
                switch (true) {
                    case /^b.*l$/igm.test(sub_county):
                        sub_county_no = 1007
                        break
                    case /^b.*t$/igm.test(sub_county):
                        sub_county_no = 1008
                        break
                    case /^c.*/ig.test(sub_county):
                        sub_county_no = 1009
                        break
                    case /^k.*/ig.test(sub_county):
                        sub_county_no = 1010
                        break
                    case /^s.*/ig.test(sub_county):
                        sub_county_no = 1011
                        break
                    default:
                        sub_county_no = 1007
                        break
                }
                break

            case /^kaka.*/ig.test(county):
                county_number = 37
                switch (true) {
                    case /^b.*/ig.test(sub_county):
                        sub_county_no = 1062
                        break
                    case /^k.*l$/igm.test(sub_county):
                        sub_county_no = 1063
                        break
                    case /^k.*ast$/igm.test(sub_county):
                        sub_county_no = 1064
                        break
                    case /^k.*rth$/igm.test(sub_county):
                        sub_county_no = 1065
                        break
                    case /^k.*uth$/igm.test(sub_county):
                        sub_county_no = 1066
                        break
                    case /^kh.*/ig.test(sub_county):
                        sub_county_no = 1067
                        break
                    case /^li.*/ig.test(sub_county):
                        sub_county_no = 1068
                        break
                    case /^lu.*/ig.test(sub_county):
                        sub_county_no = 1069
                        break
                    case /^mat.*/ig.test(sub_county):
                        sub_county_no = 1070
                        break
                    case /^matu.*/ig.test(sub_county):
                        sub_county_no = 1071
                        break
                    case /^mu.*s$/ig.test(sub_county):
                        sub_county_no = 1072
                        break
                    case /^mu.*t$/igm.test(sub_county):
                        sub_county_no = 1073
                        break
                    case /^n.*/ig.test(sub_county):
                        sub_county_no = 1074
                        break
                    default:
                        sub_county_no = 1072
                        break
                }
                break

            case /^vih.*/ig.test(county):
                county_number = 38
                switch (true) {
                    case /^e.*/ig.test(sub_county):
                        sub_county_no = 1304
                        break
                    case /^h.*/ig.test(sub_county):
                        sub_county_no = 1305
                        break
                    case /^l.*/ig.test(sub_county):
                        sub_county_no = 1306
                        break
                    case /^s.*/ig.test(sub_county):
                        sub_county_no = 1307
                        break
                    case /^v.*/ig.test(sub_county):
                        sub_county_no = 1308
                        break
                    default:
                        sub_county_no = 1308
                        break
                }
                break

            case /^bung.*/ig.test(county):
                county_number = 39
                switch (true) {
                    case /^b.*a$/igm.test(sub_county):
                        sub_county_no = 1012
                        break
                    case /^b.*al$/igm.test(sub_county):
                        sub_county_no = 1013
                        break
                    case /^b.*ast$/igm.test(sub_county):
                        sub_county_no = 1014
                        break
                    case /^b.*rth$/igm.test(sub_county):
                        sub_county_no = 1015
                        break
                    case /^b.*uth$/igm.test(sub_county):
                        sub_county_no = 1016
                        break
                    case /^b.*est$/igm.test(sub_county):
                        sub_county_no = 1017
                        break
                    case /^ch.*/ig.test(sub_county):
                        sub_county_no = 1018
                        break
                    case /^ki.*/ig.test(sub_county):
                        sub_county_no = 1019
                        break
                    case /^m.*n$/ig.test(sub_county):
                        sub_county_no = 1020
                        break
                    case /^w.*/ig.test(sub_county):
                        sub_county_no = 1021
                        break
                    case /^k.*/ig.test(sub_county):
                        sub_county_no = 1326
                        break
                    default:
                        sub_county_no = 1013
                        break
                }
                break

            case /^bus.*/ig.test(county):
                county_number = 40
                switch (true) {
                    case /^bun.*/ig.test(sub_county):
                        sub_county_no = 1022
                        break
                    case /^bus.*/ig.test(sub_county):
                        sub_county_no = 1023
                        break
                    case /^but.*/ig.test(sub_county):
                        sub_county_no = 1024
                        break
                    case /^na.*/ig.test(sub_county):
                        sub_county_no = 1025
                        break
                    case /^sa.*/ig.test(sub_county):
                        sub_county_no = 1026
                        break
                    case /^t.*rth$/img.test(sub_county):
                        sub_county_no = 1027
                        break
                    case /^t.*uth$/igm.test(sub_county):
                        sub_county_no = 1028
                        break
                    default:
                        sub_county_no = 1023
                        break
                }
                break

            case /^sia.*/ig.test(county):
                county_number = 41
                switch (true) {
                    case /^bo.*/ig.test(sub_county):
                        sub_county_no = 1269
                        break
                    case /^ge.*/ig.test(sub_county):
                        sub_county_no = 1270
                        break
                    case /^ra.*/ig.test(sub_county):
                        sub_county_no = 1271
                        break
                    case /^si.*/ig.test(sub_county):
                        sub_county_no = 1272
                        break
                    case /^uge.*/ig.test(sub_county):
                        sub_county_no = 1273
                        break
                    case /^ugu.*/ig.test(sub_county):
                        sub_county_no = 1274
                        break
                    default:
                        sub_county_no = 1272
                        break
                }
                break

            case /^kisu.*/ig.test(county):
                county_number = 42
                switch (true) {
                    case /^k.*al$/igm.test(sub_county):
                        sub_county_no = 1116
                        break
                    case /^k.*ast$/igm.test(sub_county):
                        sub_county_no = 1117
                        break
                    case /^k.*est$/igm.test(sub_county):
                        sub_county_no = 1118
                        break
                    case /^m.*/ig.test(sub_county):
                        sub_county_no = 1119
                        break
                    case /^n.*h$/ig.test(sub_county):
                        sub_county_no = 1120
                        break
                    case /^nyando.*/ig.test(sub_county):
                        sub_county_no = 1121
                        break
                    case /^s.*/ig.test(sub_county):
                        sub_county_no = 1122
                        break
                    default:
                        sub_county_no = 1116
                        break
                }
                break

            case /^hom.*/ig.test(county):
                county_number = 43
                switch (true) {
                    case /^h.*ay$/igm.test(sub_county):
                        sub_county_no = 1045
                        break
                    case /^mb.*/ig.test(sub_county):
                        sub_county_no = 1046
                        break
                    case /^nd.*/ig.test(sub_county):
                        sub_county_no = 1047
                        break
                    case /^la.*ast$/igm.test(sub_county):
                        sub_county_no = 1048
                        break
                    case /^la.*rth$/igm.test(sub_county):
                        sub_county_no = 1049
                        break
                    case /^la.*uth$/img.test(sub_county):
                        sub_county_no = 1050
                        break
                    case /^ra.*/ig.test(sub_county):
                        sub_county_no = 1051
                        break
                    case /^s.*/ig.test(sub_county):
                        sub_county_no = 1052
                        break
                    default:
                        sub_county_no = 1045
                        break
                }
                break

            case /^migo.*/ig.test(county):
                county_number = 44
                switch (true) {
                    case /^aw.*/ig.test(sub_county):
                        sub_county_no = 1190
                        break
                    case /^k.*ast$/igm.test(sub_county):
                        sub_county_no = 1191
                        break
                    case /^k.*est$/igm.test(sub_county):
                        sub_county_no = 1192
                        break
                    case /^mig.*/ig.test(sub_county):
                        sub_county_no = 1193
                        break
                    case /^ny.*/ig.test(sub_county):
                        sub_county_no = 1194
                        break
                    case /^ro.*/ig.test(sub_county):
                        sub_county_no = 1195
                        break
                    case /^s.*st$/igm.test(sub_county):
                        sub_county_no = 1196
                        break
                    case /^ur.*/ig.test(sub_county):
                        sub_county_no = 1197
                        break
                    case /^ma.*/ig.test(sub_county):
                        sub_county_no = 1329
                        break
                    default:
                        sub_county_no = 1195
                        break
                }
                break

            case /^kisi.*/ig.test(county):
                county_number = 45
                switch (true) {
                    case /^gu.*/ig.test(sub_county):
                        sub_county_no = 1106
                        break
                    case /^g.*th$/igm.test(sub_county):
                        sub_county_no = 1107
                        break
                    case /^ke.*/ig.test(sub_county):
                        sub_county_no = 1108
                        break
                    case /^k.*al$/igm.test(sub_county):
                        sub_county_no = 1109
                        break
                    case /^k.*th$/igm.test(sub_county):
                        sub_county_no = 1110
                        break
                    case /^mar.*/ig.test(sub_county):
                        sub_county_no = 1112
                        break
                    case /^mas.*/ig.test(sub_county):
                        sub_county_no = 1113
                        break
                    case /^ny.*/ig.test(sub_county):
                        sub_county_no = 1114
                        break
                    case /^sa.*/ig.test(sub_county):
                        sub_county_no = 1115
                        break
                    case /^et.*/ig.test(sub_county):
                        sub_county_no = 1327
                        break
                    default:
                        sub_county_no = 1110
                        break
                }
                break

            case /^nyam.*/ig.test(county):
                county_number = 46
                switch (true) {
                    case /^bo.*/ig.test(sub_county):
                        sub_county_no = 1246
                        break
                    case /^man.*/ig.test(sub_county):
                        sub_county_no = 1247
                        break
                    case /^ma.*th$/ig.test(sub_county):
                        sub_county_no = 1248
                        break

                    case /^n.*rth$/igm.test(sub_county):
                        sub_county_no = 1249
                        break
                    case /^n.*uth$/igm.test(sub_county):
                        sub_county_no = 1250
                        break
                    default:
                        sub_county_no = 1247
                        break
                }
                break

            case /^nai.*/ig.test(county):
                county_number = 47
                switch (true) {
                    case /^dag.*/ig.test(sub_county):
                        sub_county_no = 1212
                        break
                    case /^emb.*/ig.test(sub_county):
                        sub_county_no = 1213
                        break
                    case /^kam.*/ig.test(sub_county):
                        sub_county_no = 1214
                        break
                    case /^kasa.*/ig.test(sub_county):
                        sub_county_no = 1215
                        break
                    case /^kib.*/ig.test(sub_county):
                        sub_county_no = 1216
                        break
                    case /^lang.*/ig.test(sub_county):
                        sub_county_no = 1217
                        break
                    case /^mak.*/ig.test(sub_county):
                        sub_county_no = 1218
                        break
                    case /^mat.*/ig.test(sub_county):
                        sub_county_no = 1219
                        break
                    case /^nj.*/ig.test(sub_county):
                        sub_county_no = 1220
                        break
                    case /^st.*/ig.test(sub_county):
                        sub_county_no = 1221
                        break
                    case /^wes.*/ig.test(sub_county):
                        sub_county_no = 1222
                        break
                    default:
                        sub_county_no = 1221
                        break
                }
                break

            default:
                /****************************
                 * we got to assign them somewhere and the default value doesn't make much sense for schools in kiambu
                 */
                if (county === ' ' || county === undefined || county === '' +
                    '') {
                    county_number = 22
                    sub_county_no = 1087
                    break
                } else
                    error_index.push(index_number)
                if (sub_county = ' ' || sub_county_no === undefined || sub_county_no === '') {
                    county_number = 22
                    sub_county_no = 1087
                    break
                }
                break
        }

        async function input_no_birt() {
            console.log('Getting temp UPI for: ', index_number, f_name, l_name)
            try{
                await page.goto('http://nemis.education.go.ke/Admission/Listlearnersrep.aspx')
                await navigationPromise
            }
            catch (e) {
                if (e instanceof puppeteer.errors.TimeoutError){
                    await page.goto('http://nemis.education.go.ke/Admission/Listlearnersrep.aspx')
                    await navigationPromise
                }
            }

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_grdLearners > tbody > .GridRow:nth-child(' + nemis_grid + ') > td:nth-child(10) > a')
            await page.click('#ctl00_ContentPlaceHolder1_grdLearners > tbody > .GridRow:nth-child(' + nemis_grid + ') > td:nth-child(10) > a')

            await navigationPromise

            /* if (county_number = 30){
                 await page.select('#ctl00_ContentPlaceHolder1_ddlcounty.form-control', (county_number + 101).toString())
                 await page.waitForTimeout(1000)

             }*/

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_Surname.form-control')
            await page.click('#ctl00_ContentPlaceHolder1_Surname')
            await page.keyboard.sendCharacter(f_name)

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_FirstName')
            await page.click('#ctl00_ContentPlaceHolder1_FirstName')

            await page.keyboard.sendCharacter(m_name)

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_OtherNames')
            await page.click('#ctl00_ContentPlaceHolder1_OtherNames')

            await page.keyboard.sendCharacter(l_name)

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_DOB')
            await page.click('#ctl00_ContentPlaceHolder1_DOB')
            await page.keyboard.down('Control')
            await page.keyboard.press('KeyA')
            await page.keyboard.up('Control')
            await page.keyboard.sendCharacter(dob)


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_Birth_Cert_No')
            await page.click('#ctl00_ContentPlaceHolder1_Birth_Cert_No')

            await page.keyboard.sendCharacter(birth_no)

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_DOB')
            await page.click('#ctl00_ContentPlaceHolder1_DOB')


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_Gender')
            await page.click('#ctl00_ContentPlaceHolder1_Gender')

            await page.select('#ctl00_ContentPlaceHolder1_Gender', 'M')

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_Gender')
            await page.click('#ctl00_ContentPlaceHolder1_Gender')

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddlmedicalcondition')
            await page.click('#ctl00_ContentPlaceHolder1_ddlmedicalcondition')

            await page.select('#ctl00_ContentPlaceHolder1_ddlmedicalcondition', '0')

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddlmedicalcondition')
            await page.click('#ctl00_ContentPlaceHolder1_ddlmedicalcondition')

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_optneedsno')
            await page.click('#ctl00_ContentPlaceHolder1_optneedsno')


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddlcounty.form-control')
            await page.click('#ctl00_ContentPlaceHolder1_ddlcounty.form-control')

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddlcounty.form-control')
            await page.select('#ctl00_ContentPlaceHolder1_ddlcounty.form-control', (county_number + 100).toString())
            await page.reload()
            //await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddlcounty.form-control')
            //await page.click('#ctl00_ContentPlaceHolder1_ddlcounty.form-control')

            await navigationPromise
            //await page.waitForTimeout(1000)

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddlsubcounty.form-control')
            await page.click('#ctl00_ContentPlaceHolder1_ddlsubcounty.form-control')

            await page.select('#ctl00_ContentPlaceHolder1_ddlsubcounty.form-control', (sub_county_no).toString())

            // await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddlsubcounty')
            // await page.click('#ctl00_ContentPlaceHolder1_ddlsubcounty')


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtMotherIDNo')
            await page.click('#ctl00_ContentPlaceHolder1_txtMotherIDNo')
            if (mothers_id === ' ') (
                mothers_id = '00000000'
            )
            await page.keyboard.sendCharacter(mothers_id)


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtMotherName')
            await page.click('#ctl00_ContentPlaceHolder1_txtMotherName')
            if (mothers_name === ' ') (
                mothers_name = ''
            )
            await page.keyboard.sendCharacter(mothers_name)


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtMothersContacts')
            await page.click('#ctl00_ContentPlaceHolder1_txtMothersContacts')
            if (mothers_tel === ' ') (
                mothers_tel = '00000000'
            )
            await page.keyboard.sendCharacter(mothers_tel)


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtFatherIDNO')
            await page.click('#ctl00_ContentPlaceHolder1_txtFatherIDNO')
            if (fathers_id === ' ') (
                fathers_id = '0000000'
            )
            await page.keyboard.sendCharacter(fathers_id)


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtFatherName')
            await page.click('#ctl00_ContentPlaceHolder1_txtFatherName')
            if (fathers_name === ' ') (
                fathers_name = ''
            )
            await page.keyboard.sendCharacter(fathers_name)


            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtFatherContacts')
            await page.click('#ctl00_ContentPlaceHolder1_txtFatherContacts')
            if (fathers_tel === ' ') (
                fathers_tel = '00000000'
            )
            await page.keyboard.sendCharacter(fathers_tel)

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtReason')
            await page.click('#ctl00_ContentPlaceHolder1_txtReason')
            await page.keyboard.type('learner birth certificate already used in another school')
            //  console.log(index_number,f_name,m_name,l_name,birth_no,dob,county,sub_county,address,mothers_name,
            //     mothers_tel,mothers_id,fathers_name,fathers_tel,fathers_id)]

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_btnUsers')
            //await page.waitForTimeout(5000)
            await page.click('#ctl00_ContentPlaceHolder1_btnUsers')

        }

        if (birth_no === undefined||birth_no === '-'|| birth_no === ' ' || birth_no === '' || birth_no.length() < 4) {
            console.log(index_number,f_name,l_name,'has no birth certificate')
            await input_no_birt()
        }
        else {

            await page.click('#ctl00_ContentPlaceHolder1_grdLearners > tbody > .GridRow:nth-child(' + nemis_grid + ') > td:nth-child(9) > a')
            await navigationPromise

            await page.waitForSelector('#Birth_Cert_No')
            await page.click('#Birth_Cert_No')
            await page.keyboard.sendCharacter(birth_no)

            await page.waitForSelector('#Surname')
            await page.click('#Surname')
            await page.keyboard.sendCharacter(f_name)

            await page.waitForSelector('#FirstName')
            await page.click('#FirstName')
            await page.keyboard.sendCharacter(m_name)
            await page.waitForSelector('#OtherNames')
            await page.click('#OtherNames')
            await page.keyboard.sendCharacter(l_name)

            await page.waitForSelector('#DOB')
            await page.click('#DOB')
            await page.keyboard.down('Control')
            await page.keyboard.press('KeyA')
            await page.keyboard.up('Control')
            await page.keyboard.sendCharacter(dob)

            await page.waitForSelector('#Gender')
            await page.click('#Gender')

            await page.select('#Gender', 'M')

            await page.waitForSelector('#Gender')
            await page.click('#Gender')

            await page.waitForSelector('#ddlmedicalcondition')
            await page.click('#ddlmedicalcondition')

            await page.select('#ddlmedicalcondition', '0')

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_optneedsno')
            await page.click('#ctl00_ContentPlaceHolder1_optneedsno')

            await page.waitForSelector('#ddlcounty')
            await page.click('#ddlcounty')

            await page.select('#ddlcounty', (county_number + 100).toString())

            await page.waitForSelector('#ddlcounty')
            await page.click('#ddlcounty')

            await page.waitForSelector('#ddlcounty')
            await page.click('#ddlcounty')

            await page.waitForTimeout(1000)

            await page.waitForSelector('#ddlsubcounty')
            await page.click('#ddlsubcounty')

            await page.select('#ddlsubcounty', sub_county_no.toString())

            await page.waitForSelector('#ddlsubcounty')
            await page.click('#ddlsubcounty')

            await page.waitForSelector('#txtMotherIDNo')
            await page.click('#txtMotherIDNo')
            if(mothers_id == undefined||mothers_id == ' ') {
                mothers_id = '000000000'
            }

            await page.keyboard.sendCharacter(mothers_id)

            await page.waitForSelector('#txtMotherName')
            await page.click('#txtMotherName')
            await page.keyboard.sendCharacter(mothers_name)

            await page.waitForSelector('#txtMothersContacts')
            await page.click('#txtMothersContacts')
            if(mothers_tel == undefined||mothers_tel == ' ') {
                mothers_tel = '000000000'
            }
            await page.keyboard.sendCharacter(mothers_tel)

            await page.waitForSelector('#txtFatherIDNO')
            await page.click('#txtFatherIDNO')
            await page.keyboard.sendCharacter(fathers_id)

            await page.waitForSelector('#txtFatherName')
            await page.click('#txtFatherName')
            await page.keyboard.sendCharacter(fathers_name)

            await page.waitForSelector('#txtFatherContacts')
            await page.click('#txtFatherContacts')
            await page.keyboard.sendCharacter(fathers_tel)

            console.log(index_number, f_name, m_name, l_name, birth_no, dob, county, sub_county, address, mothers_name,
                mothers_tel, mothers_id, fathers_name, fathers_tel, fathers_id)

            await page.waitForSelector('#btnUsers')
            await page.click('#btnUsers')
            console.log('clicked submit')

            await page.waitForTimeout(5000)
            await page.waitForSelector('#ctl00_ContentPlaceHolder1_instmessage')
            await page.click('#ctl00_ContentPlaceHolder1_instmessage')
            let error = await page.$eval('.tab-content > #home > .col-md-12 > #ctl00_ContentPlaceHolder1_instmessage > .alert',
                e => e.innerHTML)
            let regex = /birth cer.*use/gim
            if (regex.test(error) === true) {
                console.log(error)

                await page.waitForTimeout(2000)

                console.log(index_number, f_name, m_name, l_name, 'has no birth certificate')
                console.log('calling input for a temporary upi')

                await input_no_birt()
            }
        }

        await page.waitForTimeout(2000)

        await page.goto('http://nemis.education.go.ke/Admission/Listlearnersrep.aspx')

        await navigationPromise
        //await excel()

    }
    console.log('Bio data capture done')

    error_index.forEach(element => {
        console.log('retrying failed inputs')
        sanity_check(element)
    })
    await browser.close()
})()