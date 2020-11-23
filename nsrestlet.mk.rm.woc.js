/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 *@author Shaun York <s@sry.dev>
 */
define(['N/log', 'N/search', 'N/record'], function (Log, Srh, Rec) {
    // TODO: Set this array via script parameter
    const NONE_BACKFLUSH_WORKCENTERS = ['16469', '16489']
    const CREATE_WORKORDER_COMPLETION = 'mk'
    const DELETE_WORKORDER_COMPLETION = 'rm'

    function log_ss_debug(title, msg, context) {
        const debug_options = {
            title,
            details: `MSG: [${msg}]\n\n${JSON.stringify(context)}`
        }
        Log.debug(debug_options)
    }

    function isJson(jdoc) {
        try {
            return JSON.parse(jdoc)
        } catch (error) {
            log_ss_debug('isJson failed to parse', error.message, jdoc)
        }
    }

    class Completion {
        constructor(props) {
            this.workordercompletion_id = props.workordercompletion_id
            this.operation_sequence = props.operation_sequence
            this.mfgoptask_id = props.mfgoptask_id
            this.workorder_id = props.workorder_id
            this.completedQty = props.completedQty
            this.location_id = props.location_id
            this.operator_id = props.operator_id
            this.worktime_id = props.worktime_id
            this.machine_id = props.machine_id
            this.workcenter = props.workcenter
            this.scrapQty = props.scrapQty
            this.item_id = props.item_id
            this.action = props.action
            this.id = props.id

            this.errors = []
            this.bin_lines = []
            this.completion = null
            this.last_workcenter = null
            this.operation_is_complete = false
            this.last_nwo_workcenter = false
            this.component_invtdets_required = false

            this.transform_parameters = {
                fromType: Rec.Type.WORK_ORDER,
                fromId: props.workorder_id,
                toType: Rec.Type.WORK_ORDER_COMPLETION,
                isDynamic: true
            }

            this.machine_operator = {
                fieldId: 'custbody_operator',
                value: props.operator_id,
                ignoreFieldChange: false
            }

            this.start_operation_sequence = {
                fieldId: 'startoperation',
                text: props.operation_sequence,
                ignoreFieldChange: false
            }

            this.end_operation_sequence = {
                fieldId: 'endoperation',
                text: props.operation_sequence,
                ignoreFieldChange: false
            }

            this.quantity = {
                fieldId: 'completedquantity',
                value: props.completedQty,
                ignoreFieldChange: false
            }

            this.scrap = {
                fieldId: 'scrapquantity',
                value: props.scrapQty,
                ignoreFieldChange: false
            }

            this.is_back_flush = {
                fieldId: 'isbackflush',
                value: true,
                ignoreFieldChange: false
            }

            this.current_state = Srh.lookupFields({
                type: 'manufacturingoperationtask',
                id: props.mfgoptask_id,
                columns: [
                    'predecessor.internalid',
                    'predecessor.completedquantity',
                    'completedquantity',
                    'predecessor.inputquantity',
                    'inputquantity'
                ]
            })

            this.nwo = Rec.load({
                type: 'workorder',
                id: props.workorder_id
            })
            this.op = Rec.load({
                type: 'manufacturingoperationtask',
                id: props.mfgoptask_id
            })

        }

        causedErrors() {
            return Boolean(this.errors.length)
        }

        props() {
            return {
                workordercompletion_id: this.workordercompletion_id,
                operation_sequence: this.operation_sequence,
                mfgoptask_id: this.mfgoptask_id,
                workorder_id: this.workorder_id,
                completedQty: this.completedQty,
                location_id: this.location_id,
                operator_id: this.operator_id,
                worktime_id: this.worktime_id,
                machine_id: this.machine_id,
                workcenter: this.workcenter,
                scrapQty: this.scrapQty,
                item_id: this.item_id,
                action: this.action,
                id: this.id
            }
        }

        init() {
            try {
                this.completion = Rec.transform(this.transform_parameters)
                this.completion.setValue(this.machine_operator)
                this.completion.setText(this.start_operation_sequence)
                this.completion.setText(this.end_operation_sequence)
                this.completion.setValue(this.quantity)
                if (parseFloat(this.scrapQty) > 0) {
                    this.completion.setValue(this.scrap)
                    const cqty = parseFloat(this.completedQty | 0)
                    const sqty = parseFloat(this.scrapQty | 0)
                    this.completedQty = (cqty + sqty).toString()

                }
            } catch (error) {
                this.errors.push(`Completion.init() ERROR: [> ${error.message} <]`)
                log_ss_debug('Completion failed on method', 'Completion.init()', {
                    ...this.props(),
                    ERROR: error.message
                })
            }
        }

        isBackFlush() {
            if (this.completion !== null) {
                try {
                    if (NONE_BACKFLUSH_WORKCENTERS.indexOf(this.workcenter) === -1) {
                        this.completion.setValue({
                            fieldId: 'isbackflush',
                            value: true,
                            ignoreFieldChange: false
                        })
                    }
                } catch (error) {
                    this.errors.push(`Completion.isBackFlush() ERROR: [> ${error.message} <]`)
                    log_ss_debug('isBackflush', 'Completion.isBackFlush()', {
                        ...this.props(),
                        ERROR: error.message
                    })
                }
            } else {
                this.errors.push('Missing completion...')
                log_ss_debug('isBackflush', 'Missing completion...', '')
            }
        }

        isValid() {
            try {
                //TODO assert predicate
                const wo = this.op.getValue({
                    fieldId: 'workorder'
                })
                const id = this.op.getValue({
                    fieldId: 'id'
                })

                if (
                    this.workorder_id === wo.toString() &&
                    this.mfgoptask_id === id.toString()
                ) {
                    this.last_workcenter = this.op.getValue({
                        fieldId: 'manufacturingworkcenter'
                    })
                    return true
                } else {
                    return false
                }
            } catch (error) {
                this.errors.push(`Completion.isValid() ERROR: [> ${error.message} <]`)
                log_ss_debug('Completion failed on method', 'Completion.isValid()', {
                    ...this.props(),
                    ERROR: error.message
                })
                return false
            }

        }

        canComplete() {
            const qty = parseFloat(this.completedQty | 0)
            const operation_required_qty = parseFloat(this.current_state['inputquantity'] | 0)
            const operation_completed_qty = parseFloat(this.current_state['completedquantity'] | 0)
            const total_completed = operation_completed_qty + qty

            this.operation_is_complete = total_completed >= operation_required_qty

            if (Array.isArray(this.current_state['predecessor.internalid'])) {
                if (this.current_state['predecessor.internalid'].length === 0) {
                    log_ss_debug('canComplete', ' first mfg operation task', 'Yes')
                    return true
                }
            }
            const previous_operation_completed_qty = parseFloat(this.current_state['predecessor.completedquantity'] | 0)
            const previous_operation_required_qty = parseFloat(this.current_state['predecessor.inputquantity'] | 0)
            const avaliable_qty = previous_operation_completed_qty - operation_completed_qty
            const remaining_qty = operation_required_qty - operation_completed_qty

            if (qty <= avaliable_qty) {
                return true
            } else {
                this.errors.push(`Completion.canComplete() ERROR: [> ${qty} less than or equal to ${avaliable_qty} <]`)
                log_ss_debug('Completion failed on method', 'Completion.canComplete()', {
                    ...this.props(),
                    qty,
                    previous_operation_completed_qty,
                    operation_completed_qty,
                    previous_operation_required_qty,
                    operation_required_qty,
                    avaliable_qty,
                    remaining_qty
                })
                return false
            }
        }

        nwoIsComplete() {
            try {
                this.nwo.setValue({
                    fieldId: 'status',
                    value: 'Built',
                    ignoreFieldChange: false
                })
                this.nwo.save()
            } catch (error) {
                this.errors.push(`Completion.nwoIsComplete() ERROR: [> ${error.message} <]`)
                log_ss_debug('Changing NWO status failed', error.message, {
                    ...this.props(),
                    ERROR: error.message
                })
            }
        }

        componentInvtDets() {
            try {

                const componentLines = this.completion.getLineCount({
                    sublistId: 'component'
                })

                for (var line = 0, l = componentLines; line !== l; line++) {

                    const c_line = {
                        sublistId: 'component',
                        fieldId: 'componentinventorydetailreq',
                        line
                    }
                    const line_requires_component_invt_dets = (this.completion.getSublistValue(c_line) === 'T')
                    if (line_requires_component_invt_dets) {
                        this.component_invtdets_required = true
                        this.bin_lines.push({
                            line,
                            componentinventorydetailreq: this.completion.getSublistValue({
                                ...c_line,
                                fieldId: 'componentinventorydetailreq'
                            }),
                            operationsequencenumber: this.completion.getSublistValue({
                                ...c_line,
                                fieldId: 'operationsequencenumber'
                            }),
                            itemlocationbinlist: this.completion.getSublistValue({
                                ...c_line,
                                fieldId: 'itemlocationbinlist'
                            }),
                            units: this.completion.getSublistValue({
                                ...c_line,
                                fieldId: 'units'
                            }),
                            item: this.completion.getSublistValue({
                                ...c_line,
                                fieldId: 'item'
                            })
                        })
                    }

                }
            } catch (error) {
                this.errors.push(`Completion.componentInvtDets() ERROR: [> ${error.message} <]`)
                log_ss_debug('Completion failed on method', 'Completion.componentInvtDets()', {
                    ...this.props(),
                    ERROR: error.message
                })
            }
        }

        commitComponentInvtDets() {
            this.bin_lines.forEach(({
                line,
                units,
                operationsequencenumber
            }) => {
                try {
                    if (operationsequencenumber.toString() === this.operation_sequence) {

                        const line_qty = this.completedQty * units

                        this.completion.selectLine({
                            sublistId: 'component',
                            line
                        })
                        this.completion.setCurrentSublistValue({
                            sublistId: 'component',
                            fieldId: 'quantity',
                            value: line_qty
                        })

                        const invtdets = this.completion.getCurrentSublistSubrecord({
                            sublistId: 'component',
                            fieldId: 'componentinventorydetail'
                        })

                        invtdets.selectLine({
                            sublistId: 'inventoryassignment',
                            line
                        })
                        invtdets.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'quantity',
                            value: this.completedQty
                        })
                        invtdets.commitLine({
                            sublistId: 'inventoryassignment'
                        })
                        this.completion.commitLine({
                            sublistId: 'component'
                        })

                    } else {
                        log_ss_debug('commitComponentInvtDets', 'Operation sequence on component line doesn\'t match this.operation_sequence...', '')
                    }
                } catch (error) {
                    this.errors.push(`Completion.commitComponentInvtDets() ERROR: [> ${error.message} <]`)
                    log_ss_debug(`Completion failed on method', 'Completion.commitComponentInvtDets(line:${line})`, {
                        ...this.props(),
                        error
                    })
                }
            })
        }

        isLastWorkCenter() {
            try {
                var ops = []
                const line_count = this.nwo.getLineCount({
                    sublistId: 'item'
                })

                for (var n = 0, l = line_count; n !== l; n++) {
                    //was getSublistField
                    ops.push(this.nwo.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'operationsequencenumber',
                        line: n
                    }))
                }

                const highest_operation_sequence_value = ops.sort().pop().toString()

                if (this.operation_sequence === highest_operation_sequence_value) {
                    this.last_nwo_workcenter = true
                    log_ss_debug('requiredInventoryDetails', 'requires woc InvtDetails', 'Yes')
                    this.completion.setValue(this.is_back_flush)
                    const inventory_detail = this.completion.getSubrecord({
                        fieldId: 'inventorydetail'
                    })
                    inventory_detail.selectNewLine({
                        sublistId: 'inventoryassignment'
                    })
                    inventory_detail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: this.completedQty - this.scrapQty
                    })
                    inventory_detail.commitLine({
                        sublistId: 'inventoryassignment'
                    })
                    return true
                } else {
                    return false
                }
            } catch (error) {
                this.errors.push(`Completion.isLastWorkCenter() ERROR: [> ${error.message} <]`)
                log_ss_debug('Completion failed on method', 'Completion.requiredInventoryDetails()', {
                    ...this.props(),
                    ERROR: error.message
                })
            }
        }

        save() {
            try {
                const completion_id = this.completion.save()
                this.workordercompletion_id = completion_id.toString()
                log_ss_debug('save', 'Saved completion', this.workordercompletion_id)
                if (this.operation_is_complete) {
                    log_ss_debug('save', 'This Mfg Operation Task is complete...', this.mfgoptask_id)
                }
            } catch (error) {
                this.errors.push(`Completion.save() ERROR: [> ${error.message} <]`)
                log_ss_debug('Completion failed on method', 'Completion.save()', {
                    ...this.props(),
                    ERROR: error.message
                })
            }
        }

        delete() {
            log_ss_debug('delete', 'Deleting completion', this.props())
            try {
                Rec.delete({
                    type: Rec.Type.WORK_ORDER_COMPLETION,
                    id: this.workordercompletion_id
                })
            } catch (error) {
                this.errors.push(`Completion.delete() ERROR: [> ${error.message} <]`)
                log_ss_debug('Completion failed on method', 'Completion.delete()', {
                    ...this.props(),
                    ERROR: error.message
                })
            }
        }
    }

    function get(args) {
        try {
            const completion = new Completion(args)
            switch (completion.action) {

                case CREATE_WORKORDER_COMPLETION: {
                    // To be generated
                    completion.init()
                    completion.componentInvtDets()

                    completion.isBackFlush()
                    const is_valid_completion_operation = completion.isValid()
                    const can_preform_completion = completion.canComplete()

                    if (completion.component_invtdets_required) {
                        completion.commitComponentInvtDets()
                    }

                    completion.isLastWorkCenter()

                    if (completion.causedErrors()) {
                        log_ss_debug('onGet', `Failed with ${completion.errors.length} errors...`, '')
                        return JSON.stringify({
                            error: true,
                            errors: completion.errors
                        })
                    } else {
                        log_ss_debug('onGet', 'Processing', completion.props())
                    }

                    if (is_valid_completion_operation && can_preform_completion) {
                        completion.save()
                        if (completion.last_nwo_workcenter && completion.operation_is_complete) {
                            completion.nwoIsComplete()
                        }
                        log_ss_debug('onGet', 'Created completion', completion.workordercompletion_id)
                        return JSON.stringify(completion.props())
                    }
                    break
                }

                case DELETE_WORKORDER_COMPLETION: {
                    completion.delete()
                    if (completion.causedErrors()) {
                        log_ss_debug('onGet', `Failed with ${completion.errors.length} errors...`, '')
                        return JSON.stringify({
                            error: true,
                            errors: completion.errors
                        })
                    } else {
                        return JSON.stringify(completion.props())
                    }
                }
                default:
                    throw Error('UNKNOWN_OR_MISSING_OPERATION_ACTION')
            }
        } catch (error) {
            log_ss_debug('onGet', error.name, error.message)
            return JSON.stringify({
                error: true,
                message: error.message
            })
        }
    }
    return {
        get
    }
})
